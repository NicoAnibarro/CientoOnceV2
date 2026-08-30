import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { Button, IconButton, Input, Loading } from "./UI";
import { api, message } from "../api/api";
import colors from "../theme/colors";

const fallback = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};
export default function LocationPicker({ visible, value, onClose, onConfirm }) {
  const map = useRef(null),
    [region, setRegion] = useState(fallback),
    [point, setPoint] = useState(null),
    [address, setAddress] = useState(""),
    [query, setQuery] = useState(""),
    [suggestions, setSuggestions] = useState([]),
    [meta, setMeta] = useState({}),
    [searchError, setSearchError] = useState(""),
    [locationGranted, setLocationGranted] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const has =
      value?.latitud !== null &&
      value?.latitud !== undefined &&
      value?.longitud !== null &&
      value?.longitud !== undefined &&
      Number.isFinite(Number(value.latitud)) &&
      Number.isFinite(Number(value.longitud));
    const next = has
      ? {
          ...fallback,
          latitude: Number(value.latitud),
          longitude: Number(value.longitud),
        }
      : fallback;
    setRegion(next);
    setPoint(
      has ? { latitude: next.latitude, longitude: next.longitude } : null,
    );
    setAddress(value?.direccion || "");
    setQuery(value?.direccion || "");
    setMeta({
      google_place_id: value?.google_place_id || null,
      ubicacion_origen: value?.ubicacion_origen || "mapa",
    });
    setSuggestions([]);
  }, [
    visible,
    value?.latitud,
    value?.longitud,
    value?.direccion,
    value?.google_place_id,
    value?.ubicacion_origen,
  ]);
  useEffect(() => {
    if (!visible) return;
    Location.getForegroundPermissionsAsync().then((permission) => {
      setLocationGranted(permission.status === "granted");
      if (permission.status === "granted" && !point)
        Location.getLastKnownPositionAsync({
          maxAge: 600000,
          requiredAccuracy: 2000,
        })
          .then((last) => {
            if (last) reverse(last.coords, "actual");
          })
          .catch(() => {});
    });
  }, [visible]);
  useEffect(() => {
    if (!visible || query.trim().length < 3) {
      setSuggestions([]);
      setSearchError("");
      return;
    }
    const timer = setTimeout(
      () =>
        api
          .get("/geo/autocomplete", { params: { input: query.trim() } })
          .then((r) => {
            setSuggestions(r.data.data);
            setSearchError(
              r.data.data.length ? "" : "Google no encontró coincidencias",
            );
          })
          .catch((error) => {
            setSuggestions([]);
            setSearchError(message(error));
          }),
      550,
    );
    return () => clearTimeout(timer);
  }, [query, visible]);
  const apply = (location) => {
    const next = {
      ...fallback,
      latitude: Number(location.latitud),
      longitude: Number(location.longitud),
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    setPoint({ latitude: next.latitude, longitude: next.longitude });
    setRegion(next);
    setAddress(location.direccion || address);
    setQuery(location.direccion || address);
    setMeta({
      google_place_id: location.google_place_id || null,
      ubicacion_origen: location.ubicacion_origen || "mapa",
    });
    map.current?.animateToRegion(next, 450);
  };
  const reverse = async (coordinate, origin = "mapa") => {
    try {
      setBusy(true);
      const r = await api.get("/geo/reverse", {
        params: {
          lat: coordinate.latitude,
          lng: coordinate.longitude,
          origen: origin,
        },
      });
      apply(r.data.data);
    } catch (error) {
      Alert.alert("No se pudo obtener la dirección", message(error));
      setPoint(coordinate);
    } finally {
      setBusy(false);
    }
  };
  const choose = async (suggestion) => {
    try {
      setBusy(true);
      setSuggestions([]);
      const r = await api.get("/geo/geocode", {
        params: { place_id: suggestion.place_id },
      });
      apply(r.data.data);
    } catch (error) {
      Alert.alert("No se pudo ubicar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const current = async () => {
    try {
      setBusy(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(permission.status === "granted");
      if (permission.status !== "granted")
        return Alert.alert(
          "Permiso necesario",
          "En Android, habilitá Ubicación para Expo Go desde Ajustes > Aplicaciones > Expo Go > Permisos.",
        );
      let enabled = await Location.hasServicesEnabledAsync();
      if (!enabled && Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
          enabled = true;
        } catch {}
      }
      if (!enabled)
        return Alert.alert(
          "Ubicación desactivada",
          "Activá la ubicación/GPS del teléfono y volvé a intentarlo.",
        );
      const last = await Location.getLastKnownPositionAsync({
        maxAge: 600000,
        requiredAccuracy: 2000,
      });
      let result;
      try {
        result = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Tiempo de espera agotado")),
              15000,
            ),
          ),
        ]);
      } catch (error) {
        if (last) result = last;
        else throw error;
      }
      await reverse(result.coords, "actual");
    } catch (error) {
      Alert.alert(
        "No se pudo obtener tu ubicación",
        `${String(error.message || error)}\n\nComprobá que GPS y Precisión de ubicación de Google estén activados.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Ubicación del cliente</Text>
            <Text style={styles.subtitle}>
              Buscá una dirección o tocá el mapa
            </Text>
          </View>
          <IconButton icon="close" onPress={onClose} />
        </View>
        <View style={styles.search}>
          <Input
            icon="search-outline"
            placeholder="Calle, número y localidad"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setAddress(text);
            }}
          />
          {suggestions.length ? (
            <View style={styles.suggestions}>
              {suggestions.slice(0, 6).map((item) => (
                <Pressable
                  key={item.place_id}
                  style={styles.suggestion}
                  onPress={() => choose(item)}
                >
                  <Text style={styles.suggestionText}>{item.direccion}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {searchError ? (
            <Text style={styles.searchError}>{searchError}</Text>
          ) : null}
        </View>
        <MapView
          ref={map}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={(event) => reverse(event.nativeEvent.coordinate)}
          showsUserLocation={locationGranted}
          showsMyLocationButton={locationGranted}
        >
          {point ? (
            <Marker
              coordinate={point}
              draggable
              onDragEnd={(event) => reverse(event.nativeEvent.coordinate)}
            />
          ) : null}
        </MapView>
        {busy ? (
          <View style={styles.loading}>
            <Loading />
          </View>
        ) : null}
        <View style={styles.footer}>
          <Button
            secondary
            icon="locate-outline"
            title="Usar mi ubicación actual"
            onPress={current}
          />
          <Input
            icon="location-outline"
            placeholder="Dirección editable"
            value={address}
            onChangeText={setAddress}
          />
          <Text style={styles.note}>
            Podés corregir el texto sin mover el punto exacto guardado en el
            mapa.
          </Text>
          <Button
            icon="checkmark"
            title="Confirmar ubicación"
            disabled={!point}
            onPress={() =>
              onConfirm({
                direccion: address,
                latitud: point.latitude,
                longitud: point.longitude,
                ...meta,
              })
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFAF0" },
  header: {
    padding: 18,
    paddingTop: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#647168", marginTop: 2 },
  search: { paddingHorizontal: 16, zIndex: 3 },
  suggestions: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D9E6DD",
    marginTop: -7,
    marginBottom: 8,
    elevation: 8,
    maxHeight: 220,
  },
  suggestion: {
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2EE",
  },
  suggestionText: { color: "#1D2922" },
  searchError: {
    color: "#B34736",
    fontSize: 12,
    marginTop: -5,
    marginBottom: 8,
  },
  map: { flex: 1, minHeight: 280 },
  loading: { position: "absolute", top: "42%", left: 0, right: 0 },
  footer: { padding: 16, backgroundColor: "#FFFAF0" },
  note: { color: "#647168", fontSize: 12, marginTop: -5, marginBottom: 5 },
});
