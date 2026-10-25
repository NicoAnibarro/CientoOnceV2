import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import { useFocusEffect } from "@react-navigation/native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import Screen from "../components/ScreenWrapper";
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
const PAYMENT_METHODS = ["efectivo", "transferencia", "qr", "tarjeta", "mixto"];
const WEEK_DAYS = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
];

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
const dateOnly = (value) => String(value || "").slice(0, 10);
const parseDate = (value) => new Date(`${dateOnly(value)}T12:00:00`);
const addMonth = (value) => {
  const date = parseDate(value);
  date.setMonth(date.getMonth() + 1);
  return localDate(date);
};
const prettyDate = (value) => {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(parseDate(value));
};
const numberValue = (value) =>
  Number(String(value || 0).replace(",", ".")) || 0;

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

function Chip({ selected, label, onPress, disabled }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[s.chip, selected && s.chipActive, disabled && s.disabled]}
    >
      <Text style={[s.chipText, selected && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DateField({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? parseDate(value)
    : new Date();
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Input
          style={s.flex}
          value={value}
          onChangeText={onChange}
          placeholder="AAAA-MM-DD"
        />
        <IconButton
          icon="calendar-outline"
          active
          onPress={() => setOpen(true)}
        />
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

function Toggle({ title, detail, value, onChange }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {detail ? <Text style={s.muted}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

function Status({ ok, yes, no }) {
  return (
    <View style={[s.status, ok ? s.statusOk : s.statusPending]}>
      <Text style={[s.statusText, ok && { color: colors.primaryDark }]}>
        {ok ? yes : no}
      </Text>
    </View>
  );
}

export function Viandas({ navigation }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("proximas");
  const [payment, setPayment] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = { vista: scope, page, limit: PAGE_SIZE };
        if (search.trim()) params.buscar = search.trim();
        if (payment !== "todos") params.pagado = payment;
        const response = await api.get("/viandas/clientes", { params });
        setRows(response.data.data || []);
        setMeta(response.data.meta || { page: 1, total_pages: 1, total: 0 });
      } catch (error) {
        Alert.alert("No se pudieron cargar las viandas", message(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, payment, scope, search],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
            colors={[colors.primary]}
          />
        }
      >
        <Header
          title="Viandas"
          subtitle="Una ficha compacta por cliente"
          action={
            <IconButton
              icon="add"
              active
              onPress={() => navigation.navigate("NuevaVianda")}
            />
          }
        />
        <View style={s.quickActions}>
          <Button
            compact
            icon="add-circle-outline"
            title="Nueva reserva"
            onPress={() => navigation.navigate("NuevaVianda")}
            style={{ flex: 1 }}
          />
          <Button
            compact
            secondary
            icon="navigate-outline"
            title="Armar reparto"
            onPress={() => navigation.navigate("RutasViandas")}
            style={{ flex: 1 }}
          />
        </View>
        <Input
          icon="search-outline"
          placeholder="Buscar cliente o tipo de vianda"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.chips}>
            {[
              ["hoy", "Pendientes de hoy"],
              ["proximas", "Próximas"],
              ["todas", "Todas"],
            ].map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={scope === key}
                onPress={() => {
                  setScope(key);
                  setPage(1);
                }}
              />
            ))}
          </View>
        </ScrollView>
        <View style={s.chips}>
          {[
            ["todos", "Cualquier pago"],
            ["false", "Con saldo"],
            ["true", "Pagados"],
          ].map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={payment === key}
              onPress={() => {
                setPayment(key);
                setPage(1);
              }}
            />
          ))}
        </View>
        <Text style={s.resultText}>
          {meta.total || 0} {Number(meta.total) === 1 ? "cliente" : "clientes"}
        </Text>
        {loading ? (
          <Loading />
        ) : rows.length ? (
          rows.map((item) => (
            <Pressable
              key={item.id_cliente}
              onPress={() =>
                navigation.navigate("DetalleViandasCliente", {
                  id_cliente: item.id_cliente,
                  nombre: item.cliente_nombre,
                })
              }
            >
              <Card style={s.clientCard}>
                <View style={s.spaceBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.clientName}>{item.cliente_nombre}</Text>
                    <Text style={s.muted} numberOfLines={1}>
                      {item.tipos || "Viandas programadas"}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={colors.primaryDark}
                  />
                </View>
                <View style={s.metrics}>
                  <View style={s.metric}>
                    <Text style={s.metricValue}>
                      {item.pendientes_totales || 0}
                    </Text>
                    <Text style={s.metricLabel}>por entregar</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={s.metricValue}>
                      {money(item.saldo_pendiente)}
                    </Text>
                    <Text style={s.metricLabel}>saldo</Text>
                  </View>
                </View>
                {item.proxima_fecha ? (
                  <View style={s.nextRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={colors.primary}
                    />
                    <Text style={s.nextText}>
                      Próxima: {prettyDate(item.proxima_fecha)} ·{" "}
                      {String(item.proxima_hora || "").slice(0, 5)}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))
        ) : (
          <Empty text="No hay reservas para este filtro" />
        )}
        <Pagination
          page={page}
          totalPages={Number(meta.total_pages) || 1}
          onChange={setPage}
        />
      </ScrollView>
    </Screen>
  );
}

function DeliveryItems({ items = [] }) {
  return (
    <View style={s.itemList}>
      {items.map((item) => (
        <Text key={item.id_pedido_vianda_detalle} style={s.itemText}>
          • {item.tipo_nombre} x{item.cantidad}
          {item.con_postre ? " + postre" : ""}
        </Text>
      ))}
    </View>
  );
}

export function DetalleViandasCliente({ navigation, route }) {
  const clientId = route.params?.id_cliente;
  const [data, setData] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [planPage, setPlanPage] = useState(1);
  const [page, setPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [paymentSeries, setPaymentSeries] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/viandas/clientes/${clientId}`);
      setData(response.data.data);
      setSelectedSeries(
        (current) =>
          current || response.data.data.series?.[0]?.id_serie || null,
      );
    } catch (error) {
      Alert.alert("No se pudo cargar el detalle", message(error));
    }
  }, [clientId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const series = data?.series || [];
  const planPages = Math.max(1, Math.ceil(series.length / PAGE_SIZE));
  const visibleSeries = series.slice(
    (planPage - 1) * PAGE_SIZE,
    planPage * PAGE_SIZE,
  );
  const activeSeries =
    series.find((item) => item.id_serie === selectedSeries) || series[0];
  const deliveries = activeSeries?.entregas || [];
  const payments = activeSeries?.pagos || [];
  const paymentPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const visiblePayments = payments.slice(
    (paymentPage - 1) * PAGE_SIZE,
    paymentPage * PAGE_SIZE,
  );
  const totalPages = Math.max(1, Math.ceil(deliveries.length / PAGE_SIZE));
  const visibleDeliveries = deliveries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const changeState = async (delivery) => {
    const next = delivery.estado === "entregado" ? "pendiente" : "entregado";
    try {
      setBusy(true);
      await api.patch(`/viandas/${delivery.id_pedido_vianda}/estado`, {
        estado: next,
      });
      await load();
    } catch (error) {
      Alert.alert("No se pudo actualizar", message(error));
    } finally {
      setBusy(false);
    }
  };

  const receiveDailyPayment = (delivery) => {
    Alert.alert(
      "Confirmar pago recibido",
      `Se registrará ${money(delivery.total)} por la entrega del ${prettyDate(delivery.fecha_entrega)}. Este movimiento ingresará a caja y no podrá duplicarse por error.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, registrar pago",
          onPress: async () => {
            try {
              setBusy(true);
              await api.post(`/viandas/${delivery.id_pedido_vianda}/pago-dia`, {
                metodo_pago: activeSeries?.metodo_pago || "efectivo",
                fecha_pago: localDate(),
              });
              await load();
            } catch (error) {
              Alert.alert("No se pudo registrar el pago", message(error));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const savePartialPayment = async () => {
    const amount = numberValue(paymentAmount);
    if (amount <= 0)
      return Alert.alert("Monto inválido", "Ingresá un monto mayor que cero.");
    try {
      setBusy(true);
      await api.post(`/viandas/series/${paymentSeries.id_serie}/pagos`, {
        monto: amount,
        metodo_pago: paymentMethod,
        fecha_pago: localDate(),
        observaciones: "Pago parcial de reserva",
      });
      setPaymentSeries(null);
      setPaymentAmount("");
      await load();
    } catch (error) {
      Alert.alert("No se pudo registrar el pago", message(error));
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.page}>
        <Header
          title={data.cliente.nombre}
          subtitle={`${series.length} ${series.length === 1 ? "plan" : "planes"} de viandas`}
          action={
            <IconButton
              icon="add"
              active
              onPress={() =>
                navigation.navigate("NuevaVianda", { id_cliente: clientId })
              }
            />
          }
        />
        {data.cliente.direccion ? (
          <View style={s.addressRow}>
            <Ionicons
              name="location-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={s.muted}>{data.cliente.direccion}</Text>
          </View>
        ) : null}
        {visibleSeries.map((item) => {
          const selected = item.id_serie === activeSeries?.id_serie;
          const balance = Math.max(
            0,
            Number(item.total_plan) - Number(item.monto_pagado),
          );
          return (
            <Pressable
              key={item.id_serie}
              onPress={() => {
                setSelectedSeries(item.id_serie);
                setPage(1);
                setPaymentPage(1);
              }}
            >
              <Card style={selected ? s.selectedCard : null}>
                <View style={s.spaceBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>
                      {item.frecuencia === "mensual"
                        ? "Plan mensual"
                        : item.frecuencia === "diario"
                          ? "Plan diario"
                          : item.frecuencia === "semanal"
                            ? "Plan semanal"
                            : "Pedido único"}
                    </Text>
                    <Text style={s.muted}>
                      {prettyDate(item.fecha_inicio)} al{" "}
                      {prettyDate(item.fecha_fin)} · {item.cantidad_entregas}{" "}
                      entregas
                    </Text>
                  </View>
                  <Status ok={!!item.pagado} yes="Pagado" no="Con saldo" />
                </View>
                <View style={s.planTotals}>
                  <Text style={s.planTotalText}>
                    Total {money(item.total_plan)}
                  </Text>
                  <Text style={s.planPaidText}>
                    Pagado {money(item.monto_pagado)}
                  </Text>
                  <Text style={s.planBalanceText}>Debe {money(balance)}</Text>
                </View>
                {!item.pagado ? (
                  <Button
                    compact
                    secondary
                    icon="wallet-outline"
                    title="Registrar adelanto o pago parcial"
                    onPress={() => {
                      setPaymentSeries(item);
                      setPaymentMethod(item.metodo_pago || "efectivo");
                    }}
                  />
                ) : null}
              </Card>
            </Pressable>
          );
        })}
        <Pagination
          page={planPage}
          totalPages={planPages}
          onChange={(nextPage) => {
            setPlanPage(nextPage);
            setPage(1);
            const first = series[(nextPage - 1) * PAGE_SIZE];
            if (first) setSelectedSeries(first.id_serie);
            setPaymentPage(1);
          }}
        />
        {activeSeries ? (
          <>
            {payments.length ? (
              <Card>
                <Text style={s.cardTitle}>Pagos registrados</Text>
                {visiblePayments.map((paymentItem) => (
                  <View key={paymentItem.id_pago_vianda} style={s.paymentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.paymentTitle}>
                        {paymentItem.id_pedido_vianda
                          ? "Pago de una entrega"
                          : "Adelanto o pago parcial"}
                      </Text>
                      <Text style={s.muted}>
                        {prettyDate(paymentItem.fecha_pago)} ·{" "}
                        {paymentItem.metodo_pago}
                      </Text>
                    </View>
                    <Text style={s.amount}>{money(paymentItem.monto)}</Text>
                  </View>
                ))}
                <Pagination
                  page={paymentPage}
                  totalPages={paymentPages}
                  onChange={setPaymentPage}
                />
              </Card>
            ) : null}
            <View style={s.sectionHeader}>
              <View>
                <Text style={s.sectionTitle}>Entregas del plan</Text>
                <Text style={s.muted}>Fechas compactas, seis por página</Text>
              </View>
            </View>
            {visibleDeliveries.map((delivery) => (
              <Card key={delivery.id_pedido_vianda} style={s.deliveryCard}>
                <View style={s.spaceBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>
                      {prettyDate(delivery.fecha_entrega)} ·{" "}
                      {String(delivery.hora_entrega).slice(0, 5)}
                    </Text>
                    <Text style={s.amount}>{money(delivery.total)}</Text>
                  </View>
                  <Status
                    ok={delivery.estado === "entregado"}
                    yes="Entregada"
                    no={
                      delivery.estado === "cancelado"
                        ? "Cancelada"
                        : "Pendiente"
                    }
                  />
                </View>
                <DeliveryItems items={delivery.items} />
                <View style={s.deliveryActions}>
                  <Button
                    compact
                    secondary={delivery.estado !== "entregado"}
                    icon={
                      delivery.estado === "entregado"
                        ? "checkmark-circle"
                        : "cube-outline"
                    }
                    title={
                      delivery.estado === "entregado"
                        ? "Entregada"
                        : "Marcar entrega"
                    }
                    disabled={busy || delivery.estado === "cancelado"}
                    onPress={() => changeState(delivery)}
                    style={{ flex: 1 }}
                  />
                  {delivery.pagado ? (
                    <View style={[s.paidButton, { flex: 1 }]}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.primaryDark}
                      />
                      <Text style={s.paidButtonText}>Pago registrado</Text>
                    </View>
                  ) : (
                    <Button
                      compact
                      icon="cash-outline"
                      title="Pago recibido"
                      disabled={busy || delivery.estado === "cancelado"}
                      onPress={() => receiveDailyPayment(delivery)}
                      style={{ flex: 1 }}
                    />
                  )}
                </View>
              </Card>
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty text="Este cliente todavía no tiene planes" />
        )}
      </ScrollView>
      <Modal
        visible={!!paymentSeries}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentSeries(null)}
      >
        <View style={s.overlay}>
          <KeyboardAwareScrollView
            bottomOffset={90}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.modalWrap}
          >
            <View style={s.modalCard}>
              <Header
                title="Registrar pago"
                subtitle={`Saldo actual: ${money(
                  paymentSeries
                    ? Number(paymentSeries.total_plan) -
                        Number(paymentSeries.monto_pagado)
                    : 0,
                )}`}
                action={
                  <IconButton
                    icon="close"
                    onPress={() => setPaymentSeries(null)}
                  />
                }
              />
              <Input
                icon="cash-outline"
                placeholder="Monto recibido"
                keyboardType="decimal-pad"
                value={paymentAmount}
                onChangeText={(value) =>
                  setPaymentAmount(value.replace(",", "."))
                }
              />
              <Text style={s.label}>Método de pago</Text>
              <View style={s.chips}>
                {PAYMENT_METHODS.map((method) => (
                  <Chip
                    key={method}
                    label={method}
                    selected={paymentMethod === method}
                    onPress={() => setPaymentMethod(method)}
                  />
                ))}
              </View>
              <Button
                icon="checkmark"
                title={busy ? "Registrando…" : "Confirmar pago"}
                disabled={busy}
                onPress={savePartialPayment}
              />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

function ItemEditor({
  item,
  types,
  dessertPrice,
  onChange,
  onRemove,
  removable,
}) {
  const selectedType = types.find(
    (type) => Number(type.id_tipo_vianda) === Number(item.id_tipo_vianda),
  );
  return (
    <Card style={s.itemEditor}>
      <View style={s.spaceBetween}>
        <Text style={s.cardTitle}>Producto de la entrega</Text>
        {removable ? (
          <IconButton icon="trash-outline" danger onPress={onRemove} />
        ) : null}
      </View>
      <Text style={s.label}>Tipo de vianda</Text>
      <View style={s.chips}>
        {types.map((type) => (
          <Chip
            key={type.id_tipo_vianda}
            label={type.nombre}
            selected={
              Number(item.id_tipo_vianda) === Number(type.id_tipo_vianda)
            }
            onPress={() =>
              onChange({
                ...item,
                id_tipo_vianda: type.id_tipo_vianda,
                precio_unitario: String(type.precio_base),
              })
            }
          />
        ))}
      </View>
      <View style={s.row}>
        <Input
          style={s.flex}
          placeholder="Cantidad"
          keyboardType="number-pad"
          value={String(item.cantidad)}
          onChangeText={(value) => onChange({ ...item, cantidad: value })}
        />
        <Input
          style={s.flex}
          placeholder="Precio unitario"
          keyboardType="decimal-pad"
          value={String(item.precio_unitario)}
          onChangeText={(value) =>
            onChange({ ...item, precio_unitario: value.replace(",", ".") })
          }
        />
      </View>
      <Toggle
        title="Con postre"
        detail={`Adicional sugerido: ${money(dessertPrice)}`}
        value={!!item.con_postre}
        onChange={(value) =>
          onChange({
            ...item,
            con_postre: value,
            precio_postre_unitario: value
              ? String(item.precio_postre_unitario || dessertPrice || 0)
              : "0",
          })
        }
      />
      {item.con_postre ? (
        <Input
          icon="ice-cream-outline"
          placeholder="Precio de postre por vianda"
          keyboardType="decimal-pad"
          value={String(item.precio_postre_unitario)}
          onChangeText={(value) =>
            onChange({
              ...item,
              precio_postre_unitario: value.replace(",", "."),
            })
          }
        />
      ) : null}
      <Text style={s.itemSubtotal}>
        {selectedType?.nombre || "Vianda"}:{" "}
        {money(
          numberValue(item.cantidad) *
            (numberValue(item.precio_unitario) +
              (item.con_postre ? numberValue(item.precio_postre_unitario) : 0)),
        )}
      </Text>
    </Card>
  );
}

export function NuevaVianda({ navigation, route }) {
  const today = localDate();
  const [config, setConfig] = useState(null);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(route.params?.id_cliente || null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [items, setItems] = useState([]);
  const [itemPage, setItemPage] = useState(1);
  const [shipping, setShipping] = useState(false);
  const [shippingPrice, setShippingPrice] = useState("0");
  const [frequency, setFrequency] = useState("unico");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [weekDays, setWeekDays] = useState([1, 2, 3, 4, 5]);
  const [time, setTime] = useState(localTime());
  const [discountType, setDiscountType] = useState("porcentaje");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMode, setPaymentMode] = useState("ninguno");
  const [advance, setAdvance] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [delivered, setDelivered] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientModal, setClientModal] = useState(false);
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
      .then(([configuration, clientResponse]) => {
        const next = configuration.data.data;
        setConfig(next);
        setClients(clientResponse.data.data || []);
        setShippingPrice(String(next.precio_envio || 0));
        const first = next.tipos?.[0];
        if (first)
          setItems([
            {
              key: Date.now(),
              id_tipo_vianda: first.id_tipo_vianda,
              cantidad: "1",
              precio_unitario: String(first.precio_base),
              con_postre: false,
              precio_postre_unitario: String(next.precio_postre || 0),
            },
          ]);
      })
      .catch((error) =>
        Alert.alert("No se pudo preparar la reserva", message(error)),
      );
  }, []);

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        client.nombre.toLowerCase().includes(clientSearch.trim().toLowerCase()),
      ),
    [clientSearch, clients],
  );
  const clientPages = Math.max(
    1,
    Math.ceil(filteredClients.length / PAGE_SIZE),
  );
  const visibleClients = filteredClients.slice(
    (clientPage - 1) * PAGE_SIZE,
    clientPage * PAGE_SIZE,
  );
  const itemPages = Math.max(1, Math.ceil(items.length / 5));
  const visibleItems = items
    .map((item, index) => ({ item, index }))
    .slice((itemPage - 1) * 5, itemPage * 5);
  useEffect(() => {
    if (itemPage > itemPages) setItemPage(itemPages);
  }, [itemPage, itemPages]);

  const deliveryDates = useMemo(() => {
    if (frequency === "unico") return [startDate];
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    )
      return [];
    const dates = [];
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (end < start) return [];
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      if (weekDays.includes(cursor.getDay())) dates.push(localDate(cursor));
    }
    return dates;
  }, [endDate, frequency, startDate, weekDays]);

  const subtotalDay = items.reduce(
    (sum, item) =>
      sum +
      numberValue(item.cantidad) *
        (numberValue(item.precio_unitario) +
          (item.con_postre ? numberValue(item.precio_postre_unitario) : 0)),
    shipping ? numberValue(shippingPrice) : 0,
  );
  const discount = Math.min(
    subtotalDay,
    discountType === "porcentaje"
      ? (subtotalDay * numberValue(discountValue)) / 100
      : numberValue(discountValue),
  );
  const totalDay = Math.max(0, subtotalDay - discount);
  const totalPlan = totalDay * deliveryDates.length;

  const chooseFrequency = (value) => {
    setFrequency(value);
    if (value === "unico") {
      setEndDate(startDate);
      setWeekDays([parseDate(startDate).getDay()]);
    } else if (value === "semanal") {
      setEndDate(addMonth(startDate));
      setWeekDays([parseDate(startDate).getDay() || 1]);
    } else {
      setEndDate(
        value === "mensual"
          ? addMonth(startDate)
          : endDate === startDate
            ? addMonth(startDate)
            : endDate,
      );
      setWeekDays([1, 2, 3, 4, 5]);
    }
  };

  const addItem = () => {
    const first = config?.tipos?.[0];
    if (!first) return;
    setItems((current) => [
      ...current,
      {
        key: Date.now() + current.length,
        id_tipo_vianda: first.id_tipo_vianda,
        cantidad: "1",
        precio_unitario: String(first.precio_base),
        con_postre: false,
        precio_postre_unitario: String(config.precio_postre || 0),
      },
    ]);
    setItemPage(Math.ceil((items.length + 1) / 5));
  };

  const saveClient = async () => {
    if (!newClient.nombre.trim())
      return Alert.alert("Falta el nombre", "Ingresá el nombre del cliente.");
    try {
      setBusy(true);
      const response = await api.post("/clientes", newClient);
      const created = {
        ...newClient,
        id_cliente: response.data.data.id_cliente,
      };
      setClients((current) => [created, ...current]);
      setClientId(created.id_cliente);
      setClientModal(false);
      setNewClient({
        nombre: "",
        telefono: "",
        direccion: "",
        observacion: "",
      });
    } catch (error) {
      Alert.alert("No se pudo crear el cliente", message(error));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!clientId)
      return Alert.alert(
        "Falta el cliente",
        "Seleccioná quién recibirá las viandas.",
      );
    if (!items.length || items.some((item) => numberValue(item.cantidad) < 1))
      return Alert.alert(
        "Revisá las viandas",
        "Cada renglón debe tener una cantidad válida.",
      );
    if (!deliveryDates.length)
      return Alert.alert(
        "Revisá las fechas",
        "La frecuencia elegida no genera entregas.",
      );
    const initialPayment = paymentMode === "parcial" ? numberValue(advance) : 0;
    if (
      paymentMode === "parcial" &&
      (initialPayment <= 0 || initialPayment >= totalPlan)
    )
      return Alert.alert(
        "Adelanto inválido",
        "El adelanto debe ser mayor que cero y menor que el total del plan.",
      );
    const body = {
      id_cliente: clientId,
      items: items.map((item) => ({
        id_tipo_vianda: item.id_tipo_vianda,
        cantidad: Number(item.cantidad),
        precio_unitario: numberValue(item.precio_unitario),
        con_postre: !!item.con_postre,
        precio_postre_unitario: numberValue(item.precio_postre_unitario),
      })),
      con_envio: shipping,
      costo_envio: numberValue(shippingPrice),
      descuento_tipo: discountValue ? discountType : null,
      descuento_valor: numberValue(discountValue),
      frecuencia: frequency,
      fecha_inicio: startDate,
      fecha_fin: frequency === "unico" ? startDate : endDate,
      dias_semana: frequency === "unico" ? [] : weekDays,
      hora_entrega: time,
      pagado: paymentMode === "completo",
      pago_inicial: initialPayment,
      fecha_pago: paymentMode === "ninguno" ? null : localDate(),
      metodo_pago: method,
      estado: delivered ? "entregado" : "pendiente",
      observaciones: notes,
    };
    try {
      setBusy(true);
      const response = await api.post("/viandas", body);
      Alert.alert(
        "Reserva creada",
        `${response.data.data.cantidad_entregas} entregas · saldo ${money(response.data.data.saldo_pendiente)}`,
        [{ text: "Aceptar", onPress: () => navigation.goBack() }],
      );
    } catch (error) {
      Alert.alert("No se pudo crear la reserva", message(error));
    } finally {
      setBusy(false);
    }
  };

  if (!config)
    return (
      <Screen>
        <Loading />
      </Screen>
    );

  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={110}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={s.page}
      >
        <Header
          title="Nueva reserva"
          subtitle="Una reserva puede combinar distintos tipos de vianda"
          action={
            <IconButton
              icon="settings-outline"
              onPress={() => navigation.navigate("ConfiguracionViandas")}
            />
          }
        />
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>1. Cliente</Text>
          <Button
            compact
            secondary
            icon="person-add-outline"
            title="Nuevo"
            onPress={() => setClientModal(true)}
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
          {visibleClients.map((client) => (
            <Pressable
              key={client.id_cliente}
              style={[
                s.clientOption,
                clientId === client.id_cliente && s.selectedCard,
              ]}
              onPress={() => setClientId(client.id_cliente)}
            >
              <Text numberOfLines={1} style={s.cardTitle}>
                {client.nombre}
              </Text>
              {clientId === client.id_cliente ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                />
              ) : null}
            </Pressable>
          ))}
        </View>
        <Pagination
          page={clientPage}
          totalPages={clientPages}
          onChange={setClientPage}
        />

        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>2. Viandas por entrega</Text>
            <Text style={s.muted}>
              Podés combinar normal, reforzada u otros tipos.
            </Text>
          </View>
          <IconButton icon="add" active onPress={addItem} />
        </View>
        {visibleItems.map(({ item, index }) => (
          <ItemEditor
            key={item.key}
            item={item}
            types={config.tipos || []}
            dessertPrice={config.precio_postre}
            removable={items.length > 1}
            onRemove={() =>
              setItems((current) =>
                current.filter((_, position) => position !== index),
              )
            }
            onChange={(next) =>
              setItems((current) =>
                current.map((currentItem, position) =>
                  position === index ? next : currentItem,
                ),
              )
            }
          />
        ))}
        <Pagination
          page={itemPage}
          totalPages={itemPages}
          onChange={setItemPage}
        />
        <Button
          secondary
          icon="add"
          title="Agregar otro tipo de vianda"
          onPress={addItem}
        />

        <Text style={s.sectionTitle}>3. Frecuencia y entrega</Text>
        <View style={s.chips}>
          {[
            ["unico", "Una vez"],
            ["diario", "Diario"],
            ["semanal", "Semanal"],
            ["mensual", "Mensual"],
          ].map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={frequency === key}
              onPress={() => chooseFrequency(key)}
            />
          ))}
        </View>
        <DateField
          label={frequency === "unico" ? "Fecha de entrega" : "Desde"}
          value={startDate}
          onChange={(value) => {
            setStartDate(value);
            if (frequency === "unico") setEndDate(value);
            else if (endDate < value)
              setEndDate(frequency === "mensual" ? addMonth(value) : value);
          }}
        />
        {frequency !== "unico" ? (
          <DateField label="Hasta" value={endDate} onChange={setEndDate} />
        ) : null}
        {frequency !== "unico" ? (
          <>
            <Text style={s.label}>Días incluidos</Text>
            <View style={s.chips}>
              {WEEK_DAYS.map(([day, label]) => (
                <Chip
                  key={day}
                  label={label}
                  selected={weekDays.includes(day)}
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
            <Text style={s.info}>
              {frequency === "mensual"
                ? "El plan mensual incluye lunes a viernes dentro del rango. Activá sábado si corresponde."
                : frequency === "diario"
                  ? "Por defecto se programan entregas de lunes a viernes."
                  : "Elegí los días de cada semana en los que habrá entrega."}
            </Text>
          </>
        ) : null}
        <Text style={s.label}>Hora de entrega</Text>
        <Input
          icon="time-outline"
          placeholder="HH:MM"
          value={time}
          onChangeText={setTime}
          keyboardType="numbers-and-punctuation"
        />
        <Toggle
          title="Con envío"
          detail="El costo se suma a cada fecha de entrega"
          value={shipping}
          onChange={setShipping}
        />
        {shipping ? (
          <Input
            icon="bicycle-outline"
            placeholder="Costo de envío por entrega"
            keyboardType="decimal-pad"
            value={shippingPrice}
            onChangeText={(value) => setShippingPrice(value.replace(",", "."))}
          />
        ) : null}

        <Text style={s.sectionTitle}>4. Descuento y pago</Text>
        <Card>
          <Text style={s.cardTitle}>Descuento por cada entrega (opcional)</Text>
          <View style={s.row}>
            <Input
              style={s.flex}
              placeholder={
                discountType === "porcentaje" ? "Porcentaje" : "Monto fijo"
              }
              keyboardType="decimal-pad"
              value={discountValue}
              onChangeText={(value) =>
                setDiscountValue(value.replace(",", "."))
              }
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
        <Text style={s.label}>¿Cuánto abonó al crear la reserva?</Text>
        <View style={s.chips}>
          {[
            ["ninguno", "Nada todavía"],
            ["parcial", "Entregó una parte"],
            ["completo", "Pagó todo"],
          ].map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={paymentMode === key}
              onPress={() => setPaymentMode(key)}
            />
          ))}
        </View>
        {paymentMode === "parcial" ? (
          <Input
            icon="cash-outline"
            placeholder="Monto entregado a cuenta"
            keyboardType="decimal-pad"
            value={advance}
            onChangeText={(value) => setAdvance(value.replace(",", "."))}
          />
        ) : null}
        <Text style={s.label}>Método de pago acordado</Text>
        <View style={s.chips}>
          {PAYMENT_METHODS.map((value) => (
            <Chip
              key={value}
              label={value}
              selected={method === value}
              onPress={() => setMethod(value)}
            />
          ))}
        </View>
        <Toggle
          title="Ya fue entregado"
          value={delivered}
          onChange={setDelivered}
        />
        <Input
          multiline
          placeholder="Observaciones de la reserva"
          value={notes}
          onChangeText={setNotes}
        />

        <View style={s.summary}>
          <Text style={s.summaryLabel}>Resumen del plan</Text>
          <Text style={s.summaryLine}>Por día: {money(totalDay)}</Text>
          <Text style={s.summaryLine}>Entregas: {deliveryDates.length}</Text>
          <Text style={s.summaryTotal}>{money(totalPlan)}</Text>
          <Text style={s.summaryHint}>
            {paymentMode === "completo"
              ? "Quedará pagado por completo."
              : paymentMode === "parcial"
                ? `Adelanto ${money(advance)} · resta ${money(Math.max(0, totalPlan - numberValue(advance)))}`
                : "El total quedará como saldo pendiente."}
          </Text>
        </View>
        <Button
          icon="checkmark"
          title={busy ? "Creando reserva…" : "Crear reserva"}
          disabled={busy}
          onPress={submit}
        />
      </KeyboardAwareScrollView>
      <Modal
        visible={clientModal}
        transparent
        animationType="fade"
        onRequestClose={() => setClientModal(false)}
      >
        <View style={s.overlay}>
          <KeyboardAwareScrollView
            bottomOffset={100}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.modalWrap}
          >
            <View style={s.modalCard}>
              <Header
                title="Nuevo cliente"
                subtitle="Podés completar o corregir su ubicación luego"
                action={
                  <IconButton
                    icon="close"
                    onPress={() => setClientModal(false)}
                  />
                }
              />
              <Input
                icon="person-outline"
                placeholder="Nombre"
                value={newClient.nombre}
                onChangeText={(nombre) =>
                  setNewClient((current) => ({ ...current, nombre }))
                }
              />
              <Input
                icon="call-outline"
                placeholder="Teléfono"
                keyboardType="phone-pad"
                value={newClient.telefono}
                onChangeText={(telefono) =>
                  setNewClient((current) => ({ ...current, telefono }))
                }
              />
              <Input
                icon="location-outline"
                placeholder="Dirección"
                value={newClient.direccion}
                onChangeText={(direccion) =>
                  setNewClient((current) => ({ ...current, direccion }))
                }
              />
              <Input
                multiline
                placeholder="Observaciones"
                value={newClient.observacion}
                onChangeText={(observacion) =>
                  setNewClient((current) => ({ ...current, observacion }))
                }
              />
              <Button
                icon="checkmark"
                title={busy ? "Guardando…" : "Crear y seleccionar"}
                disabled={busy}
                onPress={saveClient}
              />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = () =>
  StyleSheet.create({
    page: { padding: 16, paddingBottom: 110 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },
    title: { color: colors.text, fontSize: 28, fontWeight: "900" },
    muted: { color: colors.textSecondary, marginTop: 3 },
    resultText: {
      color: colors.textSecondary,
      fontWeight: "700",
      marginBottom: 10,
    },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    clientName: { color: colors.text, fontSize: 19, fontWeight: "900" },
    sectionTitle: {
      color: colors.primaryDark,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 12,
      marginBottom: 8,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 5,
    },
    label: {
      color: colors.primaryDark,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 7,
    },
    quickActions: { flexDirection: "row", gap: 8, marginBottom: 10 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    chip: {
      minHeight: 40,
      paddingHorizontal: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: "center",
      alignItems: "center",
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
    disabled: { opacity: 0.5 },
    clientCard: { paddingBottom: 13 },
    spaceBetween: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    metrics: { flexDirection: "row", gap: 9, marginTop: 14 },
    metric: {
      flex: 1,
      backgroundColor: colors.primarySoft,
      borderRadius: 13,
      padding: 11,
    },
    metricValue: { color: colors.primaryDark, fontWeight: "900", fontSize: 17 },
    metricLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    nextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginTop: 11,
    },
    nextText: { color: colors.primaryDark, fontWeight: "700" },
    addressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginBottom: 12,
    },
    status: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10 },
    statusOk: { backgroundColor: colors.primarySoft },
    statusPending: { backgroundColor: "#F2EEE4" },
    statusText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "800",
    },
    selectedCard: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primarySoft,
    },
    planTotals: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      marginTop: 12,
    },
    planTotalText: { color: colors.text, fontWeight: "800" },
    planPaidText: { color: colors.primaryDark, fontWeight: "800" },
    planBalanceText: { color: colors.warning || "#93610B", fontWeight: "900" },
    deliveryCard: { padding: 13 },
    amount: { color: colors.primaryDark, fontWeight: "900", marginTop: 4 },
    itemList: { marginTop: 9, gap: 3 },
    itemText: { color: colors.textSecondary },
    paymentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    paymentTitle: { color: colors.text, fontWeight: "800" },
    deliveryActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
    },
    paidButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primarySoft,
      borderRadius: 11,
      paddingHorizontal: 8,
      marginVertical: 5,
    },
    paidButtonText: {
      color: colors.primaryDark,
      fontWeight: "800",
      fontSize: 13,
    },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,.4)", padding: 16 },
    modalWrap: { flexGrow: 1, justifyContent: "center" },
    modalCard: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 17,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    flex: { flex: 1 },
    toggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 11,
    },
    clientGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    clientOption: {
      width: "48%",
      minHeight: 50,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 13,
      padding: 11,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    itemEditor: { borderLeftWidth: 4, borderLeftColor: colors.primary },
    itemSubtotal: {
      color: colors.primaryDark,
      fontWeight: "900",
      textAlign: "right",
      marginTop: 8,
    },
    info: {
      color: colors.textSecondary,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    summary: {
      backgroundColor: colors.primaryDark,
      borderRadius: 18,
      padding: 17,
      marginVertical: 12,
    },
    summaryLabel: {
      color: "#DCEDE3",
      fontWeight: "800",
      textTransform: "uppercase",
      fontSize: 12,
    },
    summaryLine: { color: "#FFF", marginTop: 6 },
    summaryTotal: {
      color: "#FFF",
      fontSize: 29,
      fontWeight: "900",
      marginTop: 8,
    },
    summaryHint: { color: "#DCEDE3", marginTop: 8 },
  });

let s = createStyles();
registerThemeListener(() => {
  s = createStyles();
});
