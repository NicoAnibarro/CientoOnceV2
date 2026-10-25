import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import Screen from "../components/ScreenWrapper";
import LocationPicker from "../components/LocationPicker";
import {
  Button,
  Card,
  Empty,
  IconButton,
  Input,
  Loading,
  Pagination,
  money,
} from "../components/UI";
import { api, message } from "../api/api";
import colors, { registerThemeListener } from "../theme/colors";

const PAGE_SIZE = 6;
const WEEK_DAYS = [
  [1, "L"],
  [2, "M"],
  [3, "X"],
  [4, "J"],
  [5, "V"],
  [6, "S"],
  [0, "D"],
];
const PAYMENT_METHODS = ["efectivo", "transferencia", "qr", "tarjeta", "mixto"];

const localDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const localTime = (date = new Date()) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

function Header({ title, subtitle, action }) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function Form({ children, title }) {
  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={96}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        {title ? <Header title={title} /> : null}
        {children}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

function Chip({ selected, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && s.chipActive]}>
      <Text style={[s.chipText, selected && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DateField({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? new Date(`${value}T12:00:00`)
    : new Date();
  return (
    <View>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.inline}>
        <Input
          style={s.flexInput}
          value={value}
          onChangeText={onChange}
          placeholder="AAAA-MM-DD"
        />
        <IconButton icon="calendar" active onPress={() => setOpen(true)} />
      </View>
      {open ? (
        <DateTimePicker
          value={parsed}
          mode="date"
          onChange={(_, date) => {
            setOpen(Platform.OS === "ios");
            if (date) onChange(localDate(date));
          }}
        />
      ) : null}
    </View>
  );
}

function TimeField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hours, minutes] = String(value || "12:00")
    .split(":")
    .map(Number);
  const parsed = new Date();
  parsed.setHours(
    Number.isFinite(hours) ? hours : 12,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  return (
    <View>
      <Text style={s.label}>Hora de entrega</Text>
      <View style={s.inline}>
        <Input
          style={s.flexInput}
          value={value}
          onChangeText={onChange}
          placeholder="HH:MM"
          keyboardType="numbers-and-punctuation"
        />
        <IconButton icon="time" active onPress={() => setOpen(true)} />
      </View>
      {open ? (
        <DateTimePicker
          value={parsed}
          mode="time"
          is24Hour
          onChange={(_, date) => {
            setOpen(Platform.OS === "ios");
            if (date)
              onChange(
                `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
              );
          }}
        />
      ) : null}
    </View>
  );
}

function ToggleRow({ title, detail, value, onChange }) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {detail ? <Text style={s.muted}>{detail}</Text> : null}
      </View>
      <Switch
        trackColor={{ true: colors.primary }}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}

function useLocalPagination(items, page, setPage, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, setPage, totalPages]);
  return {
    visible: items.slice((page - 1) * pageSize, page * pageSize),
    control: (
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    ),
  };
}

export function Viandas({ navigation }) {
  const [rows, setRows] = useState([]);
  const [updating, setUpdating] = useState({});
  const loadSequence = useRef(0);
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("todos");
  const [paymentFilter, setPaymentFilter] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      setLoading(true);
      const response = await api.get("/viandas", {
        params: {
          page,
          limit: 8,
          buscar: search.trim() || undefined,
          estado: stateFilter === "todos" ? undefined : stateFilter,
          pagado:
            paymentFilter === "todos" ? undefined : paymentFilter === "pagados",
        },
      });
      if (sequence === loadSequence.current) {
        setRows(
          response.data.data.map((item) => ({
            ...item,
            pagado: Number(item.pagado) === 1 || item.pagado === true,
          })),
        );
        setMeta(response.data.meta);
      }
    } catch (error) {
      Alert.alert("No se pudieron cargar las viandas", message(error));
    } finally {
      setLoading(false);
    }
  }, [page, search, stateFilter, paymentFilter]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => setPage(1), [search, stateFilter, paymentFilter]);
  const update = async (item, field, value) => {
    const id = item.id_pedido_vianda;
    if (updating[id]) return;
    ++loadSequence.current;
    const previous = item[field];
    setUpdating((current) => ({ ...current, [id]: true }));
    setRows((current) =>
      current.map((row) =>
        row.id_pedido_vianda === id ? { ...row, [field]: value } : row,
      ),
    );
    try {
      const path = field === "pagado" ? "pagado" : "estado";
      const response = await api.patch(`/viandas/${id}/${path}`, {
        [field]: value,
      });
      setRows((current) =>
        current.map((row) =>
          row.id_pedido_vianda === id
            ? {
                ...row,
                ...response.data.data,
                pagado:
                  Number(response.data.data.pagado) === 1 ||
                  response.data.data.pagado === true,
              }
            : row,
        ),
      );
    } catch (error) {
      setRows((current) =>
        current.map((row) =>
          row.id_pedido_vianda === id ? { ...row, [field]: previous } : row,
        ),
      );
      Alert.alert("No se pudo actualizar", message(error));
    } finally {
      setUpdating((current) => ({ ...current, [id]: false }));
    }
  };
  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id_pedido_vianda)}
        contentContainerStyle={s.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            <Header
              title="Viandas"
              subtitle={`${meta.total || 0} entregas programadas`}
              action={
                <IconButton
                  icon="add"
                  active
                  onPress={() => navigation.navigate("NuevaVianda")}
                />
              }
            />
            <View style={s.actionGrid}>
              <Button
                compact
                secondary
                icon="options-outline"
                title="Precios y tipos"
                style={{ flex: 1 }}
                onPress={() => navigation.navigate("ConfiguracionViandas")}
              />
              <Button
                compact
                secondary
                icon="navigate-outline"
                title="Armar reparto"
                style={{ flex: 1 }}
                onPress={() => navigation.navigate("RutasViandas")}
              />
            </View>
            <Input
              icon="search-outline"
              placeholder="Buscar cliente o tipo"
              value={search}
              onChangeText={setSearch}
            />
            <Text style={s.label}>Entrega</Text>
            <View style={s.chips}>
              {[
                ["todos", "Todos"],
                ["pendiente", "Pendientes"],
                ["entregado", "Entregados"],
                ["cancelado", "Cancelados"],
              ].map(([key, label]) => (
                <Chip
                  key={key}
                  selected={stateFilter === key}
                  label={label}
                  onPress={() => setStateFilter(key)}
                />
              ))}
            </View>
            <Text style={s.label}>Cobro</Text>
            <View style={s.chips}>
              {[
                ["todos", "Todos"],
                ["pendientes", "Sin cobrar"],
                ["pagados", "Pagados"],
              ].map(([key, label]) => (
                <Chip
                  key={key}
                  selected={paymentFilter === key}
                  label={label}
                  onPress={() => setPaymentFilter(key)}
                />
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? <Loading /> : <Empty text="No hay pedidos de viandas" />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{item.cliente_nombre}</Text>
                <Text style={s.muted}>
                  {item.tipo_nombre} × {item.cantidad}
                  {item.con_postre ? " · Con postre" : ""}
                </Text>
              </View>
              <Text style={s.amount}>{money(item.total)}</Text>
            </View>
            <Text style={s.delivery}>
              {String(item.fecha_entrega).slice(0, 10)} ·{" "}
              {String(item.hora_entrega).slice(0, 5)} · {item.frecuencia}
            </Text>
            {item.con_envio ? (
              <Text style={s.muted}>
                {item.cliente_direccion || "Dirección sin completar"}
              </Text>
            ) : (
              <Text style={s.muted}>Retira el cliente</Text>
            )}
            {item.observaciones ? (
              <Text style={s.note}>{item.observaciones}</Text>
            ) : null}
            <View style={s.toggleRow}>
              <Pressable
                style={[
                  s.statusButton,
                  item.estado === "entregado" && s.statusActive,
                ]}
                onPress={() =>
                  update(
                    item,
                    "estado",
                    item.estado === "entregado" ? "pendiente" : "entregado",
                  )
                }
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={19}
                  color={
                    item.estado === "entregado" ? "#FFF" : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    s.statusText,
                    item.estado === "entregado" && { color: "#FFF" },
                  ]}
                >
                  {item.estado === "entregado"
                    ? "Entregado"
                    : "Marcar entregado"}
                </Text>
              </Pressable>
              <View style={s.paidWrap}>
                <Text style={s.muted}>Pagado</Text>
                <Switch
                  trackColor={{ true: colors.primary }}
                  value={!!item.pagado}
                  onValueChange={(value) => update(item, "pagado", value)}
                />
              </View>
            </View>
            <View style={s.actionGrid}>
              <Button
                compact
                secondary
                icon="create-outline"
                title="Editar"
                style={{ flex: 1 }}
                onPress={() =>
                  navigation.navigate("NuevaVianda", { vianda: item })
                }
              />
              <IconButton
                danger
                icon="trash-outline"
                onPress={() =>
                  Alert.alert(
                    "Eliminar entrega",
                    "Se eliminará sólo esta entrega, no toda la serie.",
                    [
                      { text: "Cancelar" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await api.patch(
                              `/viandas/${item.id_pedido_vianda}/desactivar`,
                            );
                            load();
                          } catch (error) {
                            Alert.alert("No se pudo eliminar", message(error));
                          }
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          </Card>
        )}
        ListFooterComponent={
          <Pagination
            page={meta.page || page}
            totalPages={meta.total_pages || 1}
            onChange={setPage}
          />
        }
      />
    </Screen>
  );
}

export function NuevaVianda({ navigation, route }) {
  const editing = route?.params?.vianda || null;
  const [config, setConfig] = useState(null);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [client, setClient] = useState(editing?.id_cliente || null);
  const [typeId, setTypeId] = useState(editing?.id_tipo_vianda || null);
  const [quantity, setQuantity] = useState(String(editing?.cantidad || 1));
  const [unitPrice, setUnitPrice] = useState(
    editing ? String(editing.precio_unitario) : "",
  );
  const [dessert, setDessert] = useState(
    Number(editing?.con_postre) === 1 || editing?.con_postre === true,
  );
  const [dessertPrice, setDessertPrice] = useState(
    editing ? String(editing.precio_postre_unitario || 0) : "",
  );
  const [shipping, setShipping] = useState(
    editing
      ? Number(editing.con_envio) === 1 || editing.con_envio === true
      : true,
  );
  const [shippingPrice, setShippingPrice] = useState(
    editing ? String(editing.costo_envio || 0) : "",
  );
  const [frequency, setFrequency] = useState("unico");
  const [startDate, setStartDate] = useState(
    editing ? String(editing.fecha_entrega).slice(0, 10) : localDate(),
  );
  const [endDate, setEndDate] = useState(
    editing ? String(editing.fecha_entrega).slice(0, 10) : localDate(),
  );
  const [weekDays, setWeekDays] = useState([
    new Date(`${localDate()}T12:00:00`).getDay(),
  ]);
  const [time, setTime] = useState(
    editing ? String(editing.hora_entrega).slice(0, 5) : localTime(),
  );
  const [discountType, setDiscountType] = useState(
    editing?.descuento_tipo || "porcentaje",
  );
  const [discountValue, setDiscountValue] = useState(
    editing?.descuento_valor ? String(editing.descuento_valor) : "",
  );
  const [paid, setPaid] = useState(
    Number(editing?.pagado) === 1 || editing?.pagado === true,
  );
  const [method, setMethod] = useState(editing?.metodo_pago || "efectivo");
  const [delivered, setDelivered] = useState(editing?.estado === "entregado");
  const [notes, setNotes] = useState(editing?.observaciones || "");
  const [busy, setBusy] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationTargetId, setLocationTargetId] = useState(null);
  const [newClient, setNewClient] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    observacion: "",
  });
  useEffect(() => {
    Promise.all([
      api.get("/viandas/configuracion"),
      api.get("/clientes", { params: { all: true } }),
    ])
      .then(([settings, clientResponse]) => {
        const nextConfig = settings.data.data;
        setConfig(nextConfig);
        setClients(clientResponse.data.data);
        if (!editing) {
          const first = nextConfig.tipos?.[0];
          if (first) {
            setTypeId(first.id_tipo_vianda);
            setUnitPrice(String(first.precio_base));
          }
          setDessertPrice(String(nextConfig.precio_postre || 0));
          setShippingPrice(String(nextConfig.precio_envio || 0));
        }
      })
      .catch((error) =>
        Alert.alert("No se pudo preparar el formulario", message(error)),
      );
  }, [editing]);
  const filteredClients = useMemo(
    () =>
      clients.filter((item) =>
        item.nombre.toLowerCase().includes(clientSearch.toLowerCase()),
      ),
    [clients, clientSearch],
  );
  const clientPages = useLocalPagination(
    filteredClients,
    clientPage,
    setClientPage,
  );
  const selectedClient = clients.find((item) => item.id_cliente === client);
  const subtotal =
    (Number(unitPrice || 0) + (dessert ? Number(dessertPrice || 0) : 0)) *
      Number(quantity || 0) +
    (shipping ? Number(shippingPrice || 0) : 0);
  const discount = Math.min(
    subtotal,
    discountType === "porcentaje"
      ? (subtotal * Number(discountValue || 0)) / 100
      : Number(discountValue || 0),
  );
  const total = Math.max(0, subtotal - discount);
  const saveClient = async () => {
    try {
      const response = await api.post("/clientes", newClient);
      const created = {
        ...newClient,
        id_cliente: response.data.data.id_cliente,
      };
      setClients((current) => [created, ...current]);
      setClient(created.id_cliente);
      setClientOpen(false);
    } catch (error) {
      Alert.alert("No se pudo crear el cliente", message(error));
    }
  };
  const submit = async () => {
    const body = {
      id_cliente: client,
      id_tipo_vianda: typeId,
      cantidad: Number(quantity),
      precio_unitario: Number(unitPrice || 0),
      con_postre: dessert,
      precio_postre_unitario: Number(dessertPrice || 0),
      con_envio: shipping,
      costo_envio: Number(shippingPrice || 0),
      descuento_tipo: discountValue ? discountType : null,
      descuento_valor: Number(discountValue || 0),
      fecha_inicio: startDate,
      fecha_fin: frequency === "unico" ? startDate : endDate,
      fecha_entrega: startDate,
      hora_entrega: time,
      frecuencia: frequency,
      dias_semana: weekDays,
      pagado: paid,
      metodo_pago: method,
      estado: delivered ? "entregado" : "pendiente",
      observaciones: notes,
    };
    try {
      setBusy(true);
      editing
        ? await api.put(`/viandas/${editing.id_pedido_vianda}`, body)
        : await api.post("/viandas", body);
      navigation.goBack();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const validateAndSubmit = () => {
    if (
      !client ||
      !typeId ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 1
    )
      return Alert.alert(
        "Faltan datos",
        "Elegí cliente, tipo y una cantidad válida.",
      );
    if (
      shipping &&
      (selectedClient?.latitud == null || selectedClient?.longitud == null)
    ) {
      return Alert.alert(
        "Dirección sin confirmar",
        "Podés guardar la entrega, pero no podrá incluirse en una ruta hasta confirmar su ubicación.",
        [
          {
            text: "Revisar ubicación",
            onPress: () => {
              setNewClient({ ...selectedClient });
              setLocationTargetId(selectedClient.id_cliente);
              setLocationOpen(true);
            },
          },
          { text: "Guardar igualmente", onPress: submit },
        ],
      );
    }
    submit();
  };
  if (!config)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <Form
      title={editing ? "Editar entrega de vianda" : "Nueva reserva de vianda"}
    >
      <View style={s.spaceBetween}>
        <Text style={s.sectionTitle}>1. Cliente</Text>
        <Button
          compact
          secondary
          icon="person-add-outline"
          title="Nuevo"
          onPress={() => setClientOpen(true)}
        />
      </View>
      <Input
        icon="search-outline"
        placeholder="Buscar cliente"
        value={clientSearch}
        onChangeText={(value) => {
          setClientSearch(value);
          setClientPage(1);
        }}
      />
      <View style={s.clientGrid}>
        {clientPages.visible.map((item) => (
          <Pressable
            key={item.id_cliente}
            style={[s.clientItem, client === item.id_cliente && s.selected]}
            onPress={() => setClient(item.id_cliente)}
          >
            <Text numberOfLines={1} style={s.cardTitle}>
              {item.nombre}
            </Text>
            {client === item.id_cliente ? (
              <Ionicons
                name="checkmark-circle"
                color={colors.primary}
                size={20}
              />
            ) : null}
          </Pressable>
        ))}
      </View>
      {clientPages.control}
      <Text style={s.sectionTitle}>2. Tipo y adicionales</Text>
      <View style={s.chips}>
        {config.tipos.map((item) => (
          <Chip
            key={item.id_tipo_vianda}
            selected={typeId === item.id_tipo_vianda}
            label={item.nombre}
            onPress={() => {
              setTypeId(item.id_tipo_vianda);
              setUnitPrice(String(item.precio_base));
            }}
          />
        ))}
      </View>
      <View style={s.inline}>
        <Input
          style={s.flexInput}
          placeholder="Cantidad"
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Input
          style={s.flexInput}
          placeholder="Precio por vianda"
          keyboardType="decimal-pad"
          value={unitPrice}
          onChangeText={(value) => setUnitPrice(value.replace(",", "."))}
        />
      </View>
      <ToggleRow
        title="Agregar postre"
        detail="El adicional se calcula por vianda"
        value={dessert}
        onChange={setDessert}
      />
      {dessert ? (
        <Input
          icon="ice-cream-outline"
          placeholder="Adicional por postre"
          keyboardType="decimal-pad"
          value={dessertPrice}
          onChangeText={(value) => setDessertPrice(value.replace(",", "."))}
        />
      ) : null}
      <ToggleRow
        title="Con envío"
        detail="El costo de envío se suma una sola vez"
        value={shipping}
        onChange={setShipping}
      />
      {shipping ? (
        <Input
          icon="bicycle-outline"
          placeholder="Costo de envío"
          keyboardType="decimal-pad"
          value={shippingPrice}
          onChangeText={(value) => setShippingPrice(value.replace(",", "."))}
        />
      ) : null}
      <Text style={s.sectionTitle}>3. Frecuencia y entrega</Text>
      {!editing ? (
        <View style={s.chips}>
          {[
            ["unico", "Una vez"],
            ["diario", "Diario"],
            ["semanal", "Semanal"],
            ["mensual", "Mensual"],
          ].map(([key, label]) => (
            <Chip
              key={key}
              selected={frequency === key}
              label={label}
              onPress={() => setFrequency(key)}
            />
          ))}
        </View>
      ) : null}
      <DateField
        label={
          frequency === "unico" || editing ? "Fecha de entrega" : "Comienza"
        }
        value={startDate}
        onChange={(value) => {
          setStartDate(value);
          if (endDate < value) setEndDate(value);
        }}
      />
      {!editing && frequency !== "unico" ? (
        <DateField label="Finaliza" value={endDate} onChange={setEndDate} />
      ) : null}
      {!editing && frequency === "semanal" ? (
        <>
          <Text style={s.label}>Días de entrega</Text>
          <View style={s.chips}>
            {WEEK_DAYS.map(([day, label]) => (
              <Chip
                key={day}
                selected={weekDays.includes(day)}
                label={label}
                onPress={() =>
                  setWeekDays((current) =>
                    current.includes(day)
                      ? current.filter((value) => value !== day)
                      : [...current, day],
                  )
                }
              />
            ))}
          </View>
        </>
      ) : null}
      {!editing && frequency === "mensual" ? (
        <Text style={s.info}>
          Se programa el mismo día de cada mes; si no existe, se usa el último
          día de ese mes.
        </Text>
      ) : null}
      <TimeField value={time} onChange={setTime} />
      <Text style={s.sectionTitle}>4. Pago y detalle</Text>
      <Card>
        <Text style={s.cardTitle}>Descuento opcional</Text>
        <View style={s.inline}>
          <Input
            style={s.flexInput}
            keyboardType="decimal-pad"
            placeholder={discountType === "porcentaje" ? "Porcentaje" : "Monto"}
            value={discountValue}
            onChangeText={(value) => setDiscountValue(value.replace(",", "."))}
          />
          <Chip
            selected
            label={discountType === "porcentaje" ? "%" : "$"}
            onPress={() =>
              setDiscountType((current) =>
                current === "porcentaje" ? "fijo" : "porcentaje",
              )
            }
          />
        </View>
      </Card>
      <ToggleRow
        title="Pedido pagado"
        detail="Genera el ingreso correspondiente en caja"
        value={paid}
        onChange={setPaid}
      />
      {paid ? (
        <>
          <Text style={s.label}>Método de pago</Text>
          <View style={s.chips}>
            {PAYMENT_METHODS.map((value) => (
              <Chip
                key={value}
                selected={method === value}
                label={value}
                onPress={() => setMethod(value)}
              />
            ))}
          </View>
        </>
      ) : null}
      <ToggleRow
        title="Ya fue entregado"
        value={delivered}
        onChange={setDelivered}
      />
      <Input
        multiline
        placeholder="Observaciones de la vianda"
        value={notes}
        onChangeText={setNotes}
      />
      <View style={s.total}>
        <View>
          <Text style={s.muted}>Subtotal {money(subtotal)}</Text>
          {discount ? (
            <Text style={s.muted}>Descuento -{money(discount)}</Text>
          ) : null}
        </View>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
      <Button
        icon="checkmark"
        title={
          busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear reserva"
        }
        disabled={busy}
        onPress={validateAndSubmit}
      />
      <Modal
        visible={clientOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClientOpen(false)}
      >
        <View style={s.overlay}>
          <KeyboardAwareScrollView
            bottomOffset={70}
            contentContainerStyle={s.dialogWrap}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.dialog}>
              <Header
                title="Nuevo cliente"
                action={
                  <IconButton
                    icon="close"
                    onPress={() => setClientOpen(false)}
                  />
                }
              />
              {[
                ["nombre", "Nombre"],
                ["telefono", "Teléfono"],
                ["direccion", "Dirección"],
                ["observacion", "Observación"],
              ].map(([key, label]) => (
                <Input
                  key={key}
                  placeholder={label}
                  value={newClient[key] || ""}
                  onChangeText={(value) =>
                    setNewClient((current) => ({ ...current, [key]: value }))
                  }
                />
              ))}
              <Button
                secondary
                icon="map-outline"
                title="Confirmar ubicación en mapa"
                onPress={() => {
                  setClientOpen(false);
                  setLocationTargetId(null);
                  setLocationOpen(true);
                }}
              />
              <Button
                icon="checkmark"
                title="Crear cliente"
                disabled={!newClient.nombre.trim()}
                onPress={saveClient}
              />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
      <LocationPicker
        visible={locationOpen}
        value={newClient}
        onClose={() => {
          setLocationOpen(false);
          if (!locationTargetId) setClientOpen(true);
          setLocationTargetId(null);
        }}
        onConfirm={async (location) => {
          if (locationTargetId) {
            try {
              const updated = { ...newClient, ...location };
              await api.put(`/clientes/${locationTargetId}`, updated);
              setClients((current) =>
                current.map((item) =>
                  item.id_cliente === locationTargetId
                    ? { ...item, ...updated }
                    : item,
                ),
              );
              setNewClient({
                nombre: "",
                telefono: "",
                direccion: "",
                observacion: "",
              });
            } catch (error) {
              Alert.alert("No se pudo guardar la ubicación", message(error));
            }
            setLocationTargetId(null);
            setLocationOpen(false);
            return;
          }
          setNewClient((current) => ({ ...current, ...location }));
          setLocationOpen(false);
          setClientOpen(true);
        }}
      />
    </Form>
  );
}

export function ConfiguracionViandas() {
  const [config, setConfig] = useState(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const load = useCallback(
    () =>
      api
        .get("/viandas/configuracion")
        .then((response) => setConfig(response.data.data))
        .catch((error) => Alert.alert("Error", message(error))),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const typePages = useLocalPagination(config?.tipos || [], page, setPage);
  if (!config)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  const saveType = async () => {
    try {
      const body = { nombre: name, precio_base: Number(price || 0) };
      editing
        ? await api.put(`/viandas/tipos/${editing}`, body)
        : await api.post("/viandas/tipos", body);
      setName("");
      setPrice("");
      setEditing(null);
      load();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    }
  };
  return (
    <Form title="Configuración de viandas">
      <Card>
        <Text style={s.cardTitle}>Valores predeterminados</Text>
        <Text style={s.muted}>
          Siempre podrán modificarse dentro de cada pedido.
        </Text>
        <Input
          placeholder="Adicional por postre"
          keyboardType="decimal-pad"
          value={String(config.precio_postre ?? 0)}
          onChangeText={(value) =>
            setConfig((current) => ({
              ...current,
              precio_postre: value.replace(",", "."),
            }))
          }
        />
        <Input
          placeholder="Costo de envío"
          keyboardType="decimal-pad"
          value={String(config.precio_envio ?? 0)}
          onChangeText={(value) =>
            setConfig((current) => ({
              ...current,
              precio_envio: value.replace(",", "."),
            }))
          }
        />
        <Button
          icon="save-outline"
          title="Guardar adicionales"
          onPress={async () => {
            try {
              await api.put("/viandas/configuracion", {
                precio_postre: Number(config.precio_postre || 0),
                precio_envio: Number(config.precio_envio || 0),
              });
              Alert.alert("Listo", "Valores actualizados");
            } catch (error) {
              Alert.alert("Error", message(error));
            }
          }}
        />
      </Card>
      <Text style={s.sectionTitle}>Tipos de vianda</Text>
      {typePages.visible.map((item) => (
        <Card key={item.id_tipo_vianda}>
          <View style={s.spaceBetween}>
            <View>
              <Text style={s.cardTitle}>{item.nombre}</Text>
              <Text style={s.amount}>{money(item.precio_base)}</Text>
            </View>
            <View style={s.inline}>
              <IconButton
                icon="create-outline"
                onPress={() => {
                  setEditing(item.id_tipo_vianda);
                  setName(item.nombre);
                  setPrice(String(item.precio_base));
                }}
              />
              <IconButton
                danger
                icon="trash-outline"
                onPress={() =>
                  Alert.alert(
                    "Eliminar tipo",
                    "Sólo puede eliminarse si no tiene pedidos asociados.",
                    [
                      { text: "Cancelar" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await api.patch(
                              `/viandas/tipos/${item.id_tipo_vianda}/desactivar`,
                            );
                            load();
                          } catch (error) {
                            Alert.alert("No se pudo eliminar", message(error));
                          }
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          </View>
        </Card>
      ))}
      {typePages.control}
      <Card>
        <Text style={s.cardTitle}>
          {editing ? "Editar tipo" : "Agregar tipo"}
        </Text>
        <Input placeholder="Nombre" value={name} onChangeText={setName} />
        <Input
          placeholder="Precio base"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={(value) => setPrice(value.replace(",", "."))}
        />
        <Button
          icon="checkmark"
          title={editing ? "Guardar tipo" : "Agregar tipo"}
          disabled={!name.trim()}
          onPress={saveType}
        />
        {editing ? (
          <Button
            secondary
            title="Cancelar edición"
            onPress={() => {
              setEditing(null);
              setName("");
              setPrice("");
            }}
          />
        ) : null}
      </Card>
    </Form>
  );
}

function navigationUrl(origin, orders) {
  const destination = orders.at(-1);
  const waypoints = orders
    .slice(0, -1)
    .map((item) => `${item.latitud},${item.longitud}`)
    .join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitud},${destination.longitud}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving&dir_action=navigate`;
}

export function RutasViandas() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(localDate());
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState(null);
  const [page, setPage] = useState(1);
  const load = useCallback(
    () =>
      api
        .get("/repartos/viandas", {
          params: {
            desde: date,
            hasta: date,
            estado: "pendiente",
            buscar: search || undefined,
          },
        })
        .then((response) => setRows(response.data.data))
        .catch((error) =>
          Alert.alert("No se pudieron cargar las entregas", message(error)),
        ),
    [date, search],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    setSelected([]);
    setRoute(null);
    setPage(1);
  }, [date]);
  useEffect(() => setPage(1), [search]);
  const optimize = async () => {
    try {
      setBusy(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        return Alert.alert(
          "Permiso necesario",
          "Habilitá la ubicación para comenzar la ruta desde donde estás.",
        );
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const response = await api.post(
        "/repartos/viandas/optimizar",
        {
          viandas: selected,
          origen: {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          },
        },
        { timeout: 90000 },
      );
      setRoute(response.data.data);
    } catch (error) {
      Alert.alert("No se pudo optimizar la ruta", message(error));
    } finally {
      setBusy(false);
    }
  };
  const pages = useLocalPagination(rows, page, setPage);
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="Reparto de viandas"
          subtitle="Partida desde tu ubicación actual"
        />
        <DateField label="Día de reparto" value={date} onChange={setDate} />
        <Input
          icon="search-outline"
          placeholder="Buscar cliente, tipo o dirección"
          value={search}
          onChangeText={setSearch}
        />
        {pages.visible.map((item) => (
          <Card
            key={item.id_pedido_vianda}
            style={
              selected.includes(item.id_pedido_vianda) ? s.selectedCard : null
            }
          >
            <Pressable
              disabled={!item.tiene_ubicacion}
              onPress={() =>
                setSelected((current) =>
                  current.includes(item.id_pedido_vianda)
                    ? current.filter((id) => id !== item.id_pedido_vianda)
                    : [...current, item.id_pedido_vianda],
                )
              }
            >
              <View style={s.spaceBetween}>
                <Text style={s.cardTitle}>{item.cliente_nombre}</Text>
                {item.tiene_ubicacion ? (
                  <Ionicons
                    name={
                      selected.includes(item.id_pedido_vianda)
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={24}
                    color={colors.primary}
                  />
                ) : (
                  <Ionicons
                    name="warning-outline"
                    size={22}
                    color={colors.danger}
                  />
                )}
              </View>
              <Text style={s.muted}>
                {String(item.hora_entrega).slice(0, 5)} · {item.tipo_nombre} ×{" "}
                {item.cantidad}
              </Text>
              <Text style={s.muted}>{item.direccion || "Sin dirección"}</Text>
            </Pressable>
            {!item.tiene_ubicacion ? (
              <Button
                compact
                secondary
                icon="map-outline"
                title="Buscar o marcar la dirección"
                onPress={() => setFixing(item)}
              />
            ) : null}
          </Card>
        ))}
        {pages.control}
        {!rows.length ? (
          <Empty text="No hay entregas con envío para esta fecha" />
        ) : null}
        <Button
          icon="sparkles-outline"
          title={
            busy
              ? "Optimizando…"
              : `Optimizar ${selected.length || ""} entregas`
          }
          disabled={busy || !selected.length}
          onPress={optimize}
        />
        {route ? (
          <>
            <Card>
              <Text style={s.sectionTitle}>Ruta lista</Text>
              <Text style={s.muted}>
                {(route.distancia_metros / 1000).toFixed(1)} km ·
                aproximadamente {Math.ceil(route.duracion_segundos / 60)}{" "}
                minutos
              </Text>
            </Card>
            <MapView
              style={s.map}
              initialRegion={{
                latitude: route.origen.latitude,
                longitude: route.origen.longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
            >
              <Marker
                coordinate={route.origen}
                title="Inicio"
                pinColor={colors.primary}
              />
              {route.viandas.map((item, index) => (
                <Marker
                  key={item.id_pedido_vianda}
                  coordinate={{
                    latitude: Number(item.latitud),
                    longitude: Number(item.longitud),
                  }}
                  title={`${index + 1}. ${item.cliente_nombre}`}
                  description={`${item.tipo_nombre} x${item.cantidad}`}
                />
              ))}
              <Polyline
                coordinates={route.coordenadas}
                strokeColor={colors.primary}
                strokeWidth={5}
              />
            </MapView>
            {route.viandas.map((item, index) => (
              <Card key={item.id_pedido_vianda}>
                <Text style={s.cardTitle}>
                  {index + 1}. {item.cliente_nombre}
                </Text>
                <Text style={s.muted}>{item.direccion}</Text>
                <Text style={s.muted}>
                  {item.tipo_nombre} × {item.cantidad}
                  {item.con_postre ? " · Con postre" : ""}
                </Text>
                {item.observaciones ? (
                  <Text style={s.note}>{item.observaciones}</Text>
                ) : null}
              </Card>
            ))}
            {Array.from(
              { length: Math.ceil(route.viandas.length / 8) },
              (_, index) => {
                const part = route.viandas.slice(index * 8, index * 8 + 8);
                const origin =
                  index === 0
                    ? route.origen
                    : {
                        latitude: Number(route.viandas[index * 8 - 1].latitud),
                        longitude: Number(
                          route.viandas[index * 8 - 1].longitud,
                        ),
                      };
                return (
                  <Button
                    key={index}
                    icon="navigate"
                    title={
                      route.viandas.length <= 8
                        ? "Abrir navegación"
                        : `Navegar paradas ${index * 8 + 1} a ${index * 8 + part.length}`
                    }
                    onPress={() => Linking.openURL(navigationUrl(origin, part))}
                  />
                );
              },
            )}
          </>
        ) : null}
      </ScrollView>
      <LocationPicker
        visible={!!fixing}
        value={fixing}
        onClose={() => setFixing(null)}
        onConfirm={async (location) => {
          try {
            await api.put(`/clientes/${fixing.id_cliente}`, {
              nombre: fixing.cliente_nombre,
              telefono: fixing.cliente_telefono,
              direccion: location.direccion,
              latitud: location.latitud,
              longitud: location.longitud,
              google_place_id: location.google_place_id,
              ubicacion_origen: location.ubicacion_origen,
              instrucciones_entrega: fixing.instrucciones_entrega || null,
              observacion: fixing.observacion || null,
            });
            setFixing(null);
            load();
          } catch (error) {
            Alert.alert("No se pudo guardar la ubicación", message(error));
          }
        }}
      />
    </Screen>
  );
}

const createStyles = () =>
  StyleSheet.create({
    page: { padding: 16, paddingBottom: 100 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },
    title: { color: colors.text, fontSize: 28, fontWeight: "900" },
    sectionTitle: {
      color: colors.primaryDark,
      fontSize: 20,
      fontWeight: "800",
      marginTop: 12,
      marginBottom: 8,
    },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    muted: { color: colors.textSecondary, marginTop: 3 },
    label: {
      color: colors.primaryDark,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 7,
    },
    amount: { color: colors.primaryDark, fontWeight: "900", fontSize: 17 },
    delivery: { color: colors.primaryDark, fontWeight: "800", marginTop: 10 },
    note: {
      color: colors.text,
      backgroundColor: colors.primarySoft,
      padding: 10,
      borderRadius: 10,
      marginTop: 8,
    },
    info: {
      color: colors.textSecondary,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    inline: { flexDirection: "row", alignItems: "center", gap: 8 },
    flexInput: { flex: 1, marginBottom: 8 },
    spaceBetween: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    actionGrid: { flexDirection: "row", alignItems: "center", gap: 9 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    chip: {
      minHeight: 40,
      paddingHorizontal: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      color: colors.primaryDark,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    chipTextActive: { color: "#FFF" },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 12,
    },
    statusButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      padding: 11,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    statusActive: { backgroundColor: colors.primary },
    statusText: { color: colors.textSecondary, fontWeight: "800" },
    paidWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
    clientGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    clientItem: {
      width: "48%",
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 13,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    selected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    total: {
      backgroundColor: colors.primaryDark,
      borderRadius: 18,
      padding: 17,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginVertical: 10,
    },
    totalValue: { color: "#FFF", fontSize: 24, fontWeight: "900" },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,.35)",
      justifyContent: "center",
      padding: 16,
    },
    dialogWrap: { flexGrow: 1, justifyContent: "center" },
    dialog: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 18,
    },
    selectedCard: { borderColor: colors.primary, borderWidth: 2 },
    map: { height: 330, borderRadius: 18, marginVertical: 12 },
  });
let s = createStyles();
registerThemeListener(() => {
  s = createStyles();
});
