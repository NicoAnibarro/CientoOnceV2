import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as XLSX from "xlsx-js-style";
import Svg, { Circle } from "react-native-svg";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
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
import { useAuth } from "../context/AuthContext";
import colors from "../theme/colors";
import LocationPicker from "../components/LocationPicker";

const PAGE_SIZE = 6;

function Header({ title, subtitle, action }) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function Form({ title, children }) {
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={s.form}
        >
          <Header title={title} />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function KeyboardDialog({ children }) {
  return (
    <KeyboardAvoidingView
      style={s.modalCenter}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={s.modalKeyboardContent}
      >
        <View style={s.dialog}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SearchToolbar({ value, onChange, order, onOrder }) {
  return (
    <View style={s.toolbar}>
      <Input
        icon="search-outline"
        style={s.search}
        placeholder="Buscar..."
        value={value}
        onChangeText={onChange}
      />
      <IconButton
        icon={order === "az" ? "arrow-down-outline" : "arrow-up-outline"}
        active
        onPress={onOrder}
      />
    </View>
  );
}

function DateField({ value, onChange, label = "Fecha" }) {
  const [open, setOpen] = useState(false);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? new Date(`${value}T12:00:00`)
    : new Date();
  return (
    <>
      <View style={s.dateRow}>
        <Input
          icon="calendar-outline"
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="AAAA-MM-DD"
          value={value}
          onChangeText={onChange}
        />
        <IconButton icon="calendar" active onPress={() => setOpen(true)} />
      </View>
      {open ? (
        <DateTimePicker
          value={parsed}
          mode="date"
          onChange={(_, date) => {
            setOpen(Platform.OS === "ios");
            if (date) onChange(date.toISOString().slice(0, 10));
          }}
        />
      ) : null}
    </>
  );
}

function DiscountField({ type, setType, value, setValue }) {
  return (
    <Card>
      <Text style={s.cardTitle}>Descuento (opcional)</Text>
      <View style={s.twoColumns}>
        <Input
          style={{ flex: 1, marginBottom: 0 }}
          icon="pricetag-outline"
          placeholder={type === "porcentaje" ? "Porcentaje" : "Monto"}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={(text) => setValue(text.replace(",", "."))}
        />
        <Pressable
          style={s.discountToggle}
          onPress={() =>
            setType((current) =>
              current === "porcentaje" ? "fijo" : "porcentaje",
            )
          }
        >
          <Text style={s.discountToggleText}>
            {type === "porcentaje" ? "%" : "$"}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const PAYMENT_METHODS = [
  ["efectivo", "Efectivo", "cash-outline"],
  ["transferencia", "Transferencia", "swap-horizontal-outline"],
  ["qr", "QR", "qr-code-outline"],
  ["tarjeta", "Tarjeta", "card-outline"],
  ["mixto", "Mixto", "layers-outline"],
];
function PaymentField({ value, onChange, title = "Método de pago" }) {
  return (
    <Card>
      <Text style={s.cardTitle}>{title}</Text>
      <View style={s.chips}>
        {PAYMENT_METHODS.map(([key, label, icon]) => (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[s.paymentChip, value === key && s.paymentChipActive]}
          >
            <Ionicons
              name={icon}
              size={17}
              color={value === key ? "#FFF" : colors.primaryDark}
            />
            <Text style={value === key ? s.chipTextActive : s.chipText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const htmlSafe = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
async function shareOrderReceipt(orderId) {
  const response = await api.get(`/pedidos/${orderId}`),
    order = response.data.data,
    items = order.detalles || [];
  const html = `<html><head><meta name="viewport" content="width=device-width"><style>body{font-family:Arial;padding:28px;color:#17231b}h1{color:#278653;margin-bottom:4px}.muted{color:#66736b}.box{background:#f3faf6;padding:14px;border-radius:10px;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #dce8df;text-align:left}th{background:#3CB371;color:white}.total{text-align:right;font-size:22px;font-weight:bold;margin-top:20px}</style></head><body><h1>Ciento Once</h1><div class="muted">Comprobante de pedido #${Number(order.id_pedido)}</div><div class="box"><b>Cliente:</b> ${htmlSafe(order.cliente_nombre)}<br><b>Entrega:</b> ${htmlSafe(String(order.fecha_entrega).slice(0, 10))}<br><b>Estado:</b> ${htmlSafe(order.estado)}<br><b>Pago:</b> ${order.pagado ? `Pagado · ${htmlSafe(order.metodo_pago || "efectivo")}` : "Pendiente"}</div><table><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>${items.map((item) => `<tr><td>${htmlSafe(item.producto_nombre)}</td><td>${Number(item.cantidad)}</td><td>${money(item.precio_unitario)}</td><td>${money(item.subtotal)}</td></tr>`).join("")}</table>${Number(order.descuento_importe) > 0 ? `<p>Descuento: -${money(order.descuento_importe)}</p>` : ""}<div class="total">Total: ${money(order.total)}</div><p class="muted">Gracias por tu compra.</p></body></html>`;
  const file = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    dialogTitle: "Compartir comprobante",
  });
}

function usePagination(items, resetKey) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  return {
    page,
    setPage,
    totalPages,
    visible: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}

export function Login({ navigation }) {
  const { login, employeeLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false),
    [employeeEmail, setEmployeeEmail] = useState(""),
    [employeePin, setEmployeePin] = useState("");
  const send = async () => {
    try {
      setBusy(true);
      await login(email.trim().toLowerCase(), password);
    } catch (error) {
      Alert.alert("No se pudo ingresar", message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Form title="Ciento Once">
      <Text style={s.welcome}>Gestioná tu negocio de forma simple</Text>
      <Input
        icon="mail-outline"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        icon="lock-closed-outline"
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button
        title={busy ? "Ingresando…" : "Ingresar"}
        disabled={busy}
        onPress={send}
      />
      <Button
        secondary
        title="Crear una cuenta"
        onPress={() => navigation.navigate("Registro")}
      />
      <Button
        secondary
        icon="people-outline"
        title="Acceso de empleado"
        onPress={() => setEmployeeOpen(true)}
      />
      <Modal
        visible={employeeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmployeeOpen(false)}
      >
        <KeyboardDialog>
          <Header
            title="Acceso de empleado"
            subtitle="Usá el email del negocio y tu PIN"
            action={
              <IconButton icon="close" onPress={() => setEmployeeOpen(false)} />
            }
          />
          <Input
            icon="mail-outline"
            placeholder="Email del negocio"
            autoCapitalize="none"
            keyboardType="email-address"
            value={employeeEmail}
            onChangeText={setEmployeeEmail}
          />
          <Input
            icon="lock-closed-outline"
            placeholder="PIN personal"
            keyboardType="number-pad"
            secureTextEntry
            value={employeePin}
            onChangeText={setEmployeePin}
          />
          <Button
            title={busy ? "Ingresando…" : "Ingresar como empleado"}
            disabled={busy}
            onPress={async () => {
              try {
                setBusy(true);
                await employeeLogin(
                  employeeEmail.trim().toLowerCase(),
                  employeePin,
                );
              } catch (error) {
                Alert.alert("No se pudo ingresar", message(error));
              } finally {
                setBusy(false);
              }
            }}
          />
        </KeyboardDialog>
      </Modal>
    </Form>
  );
}

export function Registro({ navigation }) {
  const { register } = useAuth();
  const [value, setValue] = useState({
    nombre: "",
    email: "",
    password: "",
    confirmar: "",
  });
  const [busy, setBusy] = useState(false);
  const change = (key, text) =>
    setValue((current) => ({ ...current, [key]: text }));
  const send = async () => {
    if (value.password !== value.confirmar)
      return Alert.alert("Revisá los datos", "Las contraseñas no coinciden");
    try {
      setBusy(true);
      await register(value);
    } catch (error) {
      Alert.alert("No se pudo crear la cuenta", message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Form title="Crear cuenta">
      <Input
        icon="person-outline"
        placeholder="Nombre"
        value={value.nombre}
        onChangeText={(text) => change("nombre", text)}
      />
      <Input
        icon="mail-outline"
        placeholder="Email"
        autoCapitalize="none"
        value={value.email}
        onChangeText={(text) => change("email", text)}
      />
      <Input
        icon="lock-closed-outline"
        placeholder="Contraseña (6 a 12 caracteres)"
        secureTextEntry
        value={value.password}
        onChangeText={(text) => change("password", text)}
      />
      <Input
        icon="shield-checkmark-outline"
        placeholder="Confirmar contraseña"
        secureTextEntry
        value={value.confirmar}
        onChangeText={(text) => change("confirmar", text)}
      />
      <Button
        title={busy ? "Creando…" : "Crear cuenta"}
        disabled={busy}
        onPress={send}
      />
      <Button secondary title="Regresar" onPress={() => navigation.goBack()} />
    </Form>
  );
}

function DashboardMetric({
  icon,
  label,
  value,
  detail,
  tone = "green",
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        s.metricCard,
        tone === "amber" && s.metricCardAmber,
        tone === "dark" && s.metricCardDark,
      ]}
    >
      <View
        style={[
          s.metricIcon,
          tone === "amber" && s.metricIconAmber,
          tone === "dark" && s.metricIconDark,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={
            tone === "dark"
              ? "#FFF"
              : tone === "amber"
                ? "#93610B"
                : colors.primaryDark
          }
        />
      </View>
      <Text
        style={[s.metricValue, tone === "dark" && { color: "#FFF" }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={[s.metricLabel, tone === "dark" && { color: "#DDE9E1" }]}>
        {label}
      </Text>
      {detail ? (
        <Text style={[s.metricDetail, tone === "dark" && { color: "#BFD1C5" }]}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Home({ navigation }) {
  const { session, logout } = useAuth();
  const [data, setData] = useState(null);
  const [menu, setMenu] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      api
        .get("/dashboard")
        .then((response) => {
          if (active) setData(response.data.data);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );
  const go = (name) => {
    setMenu(false);
    navigation.navigate(name);
  };
  const summary = data?.resumen || {},
    alerts = data?.alertas || {};
  const currentRole = session?.usuario?.rol || "propietario",
    canManage = ["propietario", "administrador"].includes(currentRole),
    canSell = canManage || currentRole === "ventas",
    canUseCash = canManage || currentRole === "caja";
  const todayLabel = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return (
    <Screen>
      <ScrollView contentContainerStyle={s.page}>
        <Header
          title={`Hola, ${session?.usuario?.nombre || ""}`}
          subtitle={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
          action={
            <IconButton icon="menu" active onPress={() => setMenu(true)} />
          }
        />
        <View style={s.dashboardHero}>
          <View style={{ flex: 1 }}>
            <Text style={s.dashboardEyebrow}>RESUMEN DE HOY</Text>
            <Text style={s.dashboardHeroValue}>
              {money(summary.ventas_hoy)}
            </Text>
            <Text style={s.dashboardHeroText}>
              {summary.operaciones_hoy || 0} pedidos registrados hoy
            </Text>
          </View>
          <View style={s.dashboardHeroIcon}>
            <Ionicons name="trending-up" size={26} color="#FFF" />
          </View>
        </View>
        <View style={s.metricGrid}>
          <DashboardMetric
            icon="wallet-outline"
            label="Caja actual"
            value={money(summary.balance_caja)}
            detail="Balance acumulado"
            tone="dark"
            onPress={canUseCash ? () => go("Caja") : undefined}
          />
          <DashboardMetric
            icon="time-outline"
            label="Pendientes"
            value={summary.pedidos_pendientes || 0}
            detail={`${summary.entregas_hoy || 0} para hoy`}
            tone="amber"
            onPress={() => go("Pedidos")}
          />
        </View>
        {alerts.pedidos_atrasados > 0 || alerts.stock_bajo?.length ? (
          <Card style={s.alertPanel}>
            <View style={s.alertHeader}>
              <View style={s.alertIcon}>
                <Ionicons name="notifications" size={19} color="#9A5D00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>Requiere atención</Text>
                <Text style={s.meta}>
                  Revisá estos puntos antes de continuar.
                </Text>
              </View>
            </View>
            {alerts.pedidos_atrasados > 0 ? (
              <Pressable style={s.alertRow} onPress={() => go("Pedidos")}>
                <Text style={s.alertRowText}>
                  {alerts.pedidos_atrasados} pedidos con fecha vencida
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#9A5D00" />
              </Pressable>
            ) : null}
            {alerts.stock_bajo?.length ? (
              <Pressable
                style={s.alertRow}
                disabled={!canManage}
                onPress={() => go("Stock")}
              >
                <Text style={s.alertRowText}>
                  {alerts.stock_bajo.length} productos debajo de su mínimo
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#9A5D00" />
              </Pressable>
            ) : null}
          </Card>
        ) : null}
        <View style={s.sectionHeading}>
          <View>
            <Text style={s.sectionTitle}>Acciones rápidas</Text>
            <Text style={s.sectionHint}>Registrá una operación</Text>
          </View>
        </View>
        <View style={s.quickGrid}>
          {canSell ? (
            <Pressable style={s.quickCard} onPress={() => go("NuevoPedido")}>
              <View style={s.quickIcon}>
                <Ionicons name="receipt-outline" size={27} color="#FFF" />
              </View>
              <Text style={s.quickTitle}>Nuevo pedido</Text>
              <Text style={s.quickText}>Registrar una venta</Text>
            </Pressable>
          ) : null}
          {canManage ? (
            <Pressable style={s.quickCard} onPress={() => go("NuevaCompra")}>
              <View style={s.quickIcon}>
                <Ionicons name="cart-outline" size={27} color="#FFF" />
              </View>
              <Text style={s.quickTitle}>Nueva compra</Text>
              <Text style={s.quickText}>Cargar un gasto</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={s.sectionHeading}>
          <View>
            <Text style={s.sectionTitle}>Próximos pedidos</Text>
            <Text style={s.sectionHint}>Lo siguiente en tu agenda</Text>
          </View>
          <Pressable onPress={() => go("Pedidos")}>
            <Text style={s.sectionLink}>Ver todos</Text>
          </Pressable>
        </View>
        {data ? (
          data.pedidos_proximos?.length ? (
            data.pedidos_proximos.slice(0, 6).map((item) => (
              <Card key={item.id_pedido}>
                <View style={s.spaceBetween}>
                  <Text style={s.cardTitle}>{item.cliente_nombre}</Text>
                  <Text style={s.amount}>{money(item.total)}</Text>
                </View>
                <Text style={s.meta}>
                  {String(item.fecha_entrega).slice(0, 10)} ·{" "}
                  {item.pagado ? "Pagado" : "Pago pendiente"}
                </Text>
                <StatusPill
                  active={item.estado === "entregado"}
                  text={item.estado}
                />
              </Card>
            ))
          ) : (
            <Empty text="No hay pedidos próximos" />
          )
        ) : (
          <Loading />
        )}
      </ScrollView>
      <Modal
        visible={menu}
        transparent
        animationType="fade"
        onRequestClose={() => setMenu(false)}
      >
        <Pressable style={s.overlay} onPress={() => setMenu(false)}>
          <Pressable style={s.drawer} onPress={() => {}}>
            <Text style={s.drawerTitle}>Menú</Text>
            {[
              ["people-outline", "Clientes", "Clientes"],
              ["cube-outline", "Productos", "Productos"],
              ["leaf-outline", "Insumos", "Insumos"],
              ["calculator-outline", "Calculadora de costos", "Calculadora"],
              ["pricetags-outline", "Costos guardados", "CostosProductos"],
              ["map-outline", "Rutas de reparto", "RutasReparto"],
              ["business-outline", "Centro comercial", "CentroComercial"],
              ["help-circle-outline", "Ayuda", "Ayuda"],
            ]
              .filter(
                ([, , route]) =>
                  route !== "CentroComercial" ||
                  ["propietario", "administrador"].includes(
                    session?.usuario?.rol || "propietario",
                  ),
              )
              .map(([icon, label, route]) => (
                <Pressable
                  key={route}
                  style={s.menuItem}
                  onPress={() => go(route)}
                >
                  <Ionicons name={icon} size={22} color={colors.primaryDark} />
                  <Text style={s.menuText}>{label}</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              ))}
            <Button
              danger
              icon="log-out-outline"
              title="Cerrar sesión"
              onPress={logout}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const crudConfig = {
  Productos: {
    path: "productos",
    title: "Productos",
    icon: "cube-outline",
    fields: [
      ["nombre", "Nombre"],
      ["descripcion", "Descripción"],
      ["precio_venta", "Precio de venta"],
      ["costo_estimado", "Costo estimado"],
      ["stock_actual", "Stock inicial"],
      ["stock_minimo", "Alerta de stock mínimo"],
    ],
    defaults: { categoria: "Dulce", stock_actual: "0", stock_minimo: "5" },
  },
  Clientes: {
    path: "clientes",
    title: "Clientes",
    icon: "people-outline",
    fields: [
      ["nombre", "Nombre"],
      ["telefono", "Teléfono"],
      ["direccion", "Dirección"],
      ["instrucciones_entrega", "Indicaciones para la entrega"],
      ["observacion", "Observación"],
    ],
    defaults: {},
  },
  Insumos: {
    path: "insumos",
    title: "Insumos",
    icon: "leaf-outline",
    fields: [
      ["nombre", "Nombre"],
      ["descripcion", "Descripción"],
      ["precio_referencia", "Precio de referencia"],
      ["cantidad_referencia", "Cantidad de referencia (gramos si es peso)"],
    ],
    defaults: {
      tipo_medida: "peso",
      unidad_referencia: "g",
      fecha_precio: new Date().toISOString().slice(0, 10),
    },
  },
};

function LegacyCrudList({ route, navigation }) {
  const config = crudConfig[route.name];
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState("az");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(config.defaults);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    const requests = [api.get(`/${config.path}`, { params: { limit: 100 } })];
    if (config.path === "productos")
      requests.push(api.get("/categorias-productos"));
    Promise.all(requests)
      .then(([response, cats]) => {
        setRows(response.data.data);
        if (cats) {
          setCategories(cats.data.data);
          setCategory((current) => current || cats.data.data[0]?.nombre || "");
        }
      })
      .catch((error) => Alert.alert("Error", message(error)))
      .finally(() => setLoading(false));
  }, [config.path]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((item) =>
          item.nombre.toLowerCase().includes(search.toLowerCase()),
        )
        .filter(
          (item) => route.name !== "Productos" || item.categoria === category,
        )
        .sort((a, b) =>
          order === "az"
            ? a.nombre.localeCompare(b.nombre)
            : b.nombre.localeCompare(a.nombre),
        ),
    [rows, search, order, category, route.name],
  );
  const pages = usePagination(filtered, `${search}-${order}-${category}`);
  const openNew = () => {
    setEditing(null);
    setForm({
      ...config.defaults,
      categoria: categories[0]?.nombre || config.defaults.categoria,
    });
    setFormOpen(true);
  };
  const save = async () => {
    try {
      editing
        ? await api.put(`/${config.path}/${editing}`, form)
        : await api.post(`/${config.path}`, form);
      setFormOpen(false);
      load();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    }
  };
  const remove = (id) =>
    Alert.alert("Eliminar", "¿Seguro que querés eliminar este registro?", [
      { text: "Cancelar" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await api.patch(`/${config.path}/${id}/desactivar`);
          load();
        },
      },
    ]);
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) =>
          String(item[Object.keys(item).find((key) => key.startsWith("id_"))])
        }
        ListHeaderComponent={
          <>
            <Header
              title={config.title}
              subtitle={`${filtered.length} registros`}
              action={<IconButton icon="add" active onPress={openNew} />}
            />
            {route.name === "Productos" ? (
              <View style={s.segment}>
                <Pressable
                  onPress={() => setCategory("dulce")}
                  style={[
                    s.segmentButton,
                    category === "dulce" && s.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      s.segmentText,
                      category === "dulce" && s.segmentTextActive,
                    ]}
                  >
                    Dulces
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setCategory("salado")}
                  style={[
                    s.segmentButton,
                    category === "salado" && s.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      s.segmentText,
                      category === "salado" && s.segmentTextActive,
                    ]}
                  >
                    Salados
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <SearchToolbar
              value={search}
              onChange={setSearch}
              order={order}
              onOrder={() =>
                setOrder((current) => (current === "az" ? "za" : "az"))
              }
            />
            {route.name === "Insumos" ? (
              <Button
                secondary
                icon="calculator-outline"
                title="Calculadora de costos"
                onPress={() => navigation.navigate("Calculadora")}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={loading ? <Loading /> : <Empty />}
        renderItem={({ item }) => {
          const id =
            item[Object.keys(item).find((key) => key.startsWith("id_"))];
          return (
            <Card>
              <View style={s.spaceBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{item.nombre}</Text>
                  {item.precio_venta !== undefined ? (
                    <>
                      <Text style={s.amount}>{money(item.precio_venta)}</Text>
                      <Text style={s.meta}>
                        {item.categoria} · Stock {item.stock_actual}
                      </Text>
                    </>
                  ) : null}
                  {item.telefono !== undefined ? (
                    <Text style={s.meta}>
                      {item.telefono || "Sin teléfono"} ·{" "}
                      {item.direccion || "Sin dirección"}
                    </Text>
                  ) : null}
                  {item.precio_referencia !== undefined ? (
                    <Text style={s.meta}>
                      {money(item.precio_referencia)} por{" "}
                      {item.cantidad_referencia} {item.unidad_referencia}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={s.actionRow}>
                {config.path === "clientes" ? (
                  <IconButton
                    icon="analytics-outline"
                    onPress={() =>
                      navigation.navigate("HistorialCliente", { idCliente: id })
                    }
                  />
                ) : null}
                <Button
                  compact
                  secondary
                  icon="create-outline"
                  title="Editar"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setEditing(id);
                    setForm({ ...item });
                    setFormOpen(true);
                  }}
                />
                <IconButton
                  danger
                  icon="trash-outline"
                  onPress={() => remove(id)}
                />
              </View>
            </Card>
          );
        }}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
      <CrudModal
        visible={formOpen}
        config={config}
        form={form}
        setForm={setForm}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
    </Screen>
  );
}

function LegacyCrudModal({
  visible,
  config,
  form,
  setForm,
  editing,
  onClose,
  onSave,
}) {
  const numberField = (key) =>
    [
      "precio_venta",
      "costo_estimado",
      "stock_actual",
      "precio_referencia",
      "cantidad_referencia",
      "stock_minimo",
    ].includes(key);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Form
        title={
          editing
            ? `Editar ${config.title.toLowerCase()}`
            : `Nuevo ${config.title.toLowerCase()}`
        }
      >
        {config.fields.map(([key, label]) => (
          <Input
            key={key}
            placeholder={label}
            keyboardType={numberField(key) ? "decimal-pad" : "default"}
            value={String(form[key] ?? "")}
            onChangeText={(text) =>
              setForm((current) => ({
                ...current,
                [key]: numberField(key) ? text.replace(",", ".") : text,
              }))
            }
          />
        ))}
        {config.path === "productos" ? (
          <>
            <Text style={s.label}>Categoría</Text>
            <View style={s.segment}>
              <Pressable
                onPress={() =>
                  setForm((current) => ({ ...current, categoria: "dulce" }))
                }
                style={[
                  s.segmentButton,
                  form.categoria === "dulce" && s.segmentActive,
                ]}
              >
                <Text
                  style={[
                    s.segmentText,
                    form.categoria === "dulce" && s.segmentTextActive,
                  ]}
                >
                  Dulce
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setForm((current) => ({ ...current, categoria: "salado" }))
                }
                style={[
                  s.segmentButton,
                  form.categoria === "salado" && s.segmentActive,
                ]}
              >
                <Text
                  style={[
                    s.segmentText,
                    form.categoria === "salado" && s.segmentTextActive,
                  ]}
                >
                  Salado
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {config.path === "insumos" ? (
          <>
            <Text style={s.label}>Tipo y unidad</Text>
            <View style={s.chips}>
              {[
                ["peso", "g"],
                ["volumen", "ml"],
                ["unidad", "unidad"],
              ].map(([type, unit]) => (
                <Pressable
                  key={type}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      tipo_medida: type,
                      unidad_referencia: unit,
                    }))
                  }
                  style={[s.chip, form.tipo_medida === type && s.chipActive]}
                >
                  <Text
                    style={
                      form.tipo_medida === type ? s.chipTextActive : s.chipText
                    }
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        <Button icon="checkmark" title="Guardar" onPress={onSave} />
        <Button secondary title="Cancelar" onPress={onClose} />
      </Form>
    </Modal>
  );
}

export function CrudList({ route, navigation }) {
  const config = crudConfig[route.name],
    isProducts = route.name === "Productos";
  const [rows, setRows] = useState([]),
    [categories, setCategories] = useState([]),
    [search, setSearch] = useState(""),
    [order, setOrder] = useState("az"),
    [category, setCategory] = useState(""),
    [form, setForm] = useState(config.defaults),
    [editing, setEditing] = useState(null),
    [formOpen, setFormOpen] = useState(false),
    [locationOpen, setLocationOpen] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/${config.path}`, { params: { limit: 100 } }),
      isProducts ? api.get("/categorias-productos") : Promise.resolve(null),
    ])
      .then(([a, b]) => {
        setRows(a.data.data);
        if (b) {
          setCategories(b.data.data);
          setCategory((current) => current || b.data.data[0]?.nombre || "");
        }
      })
      .catch((error) => Alert.alert("Error", message(error)))
      .finally(() => setLoading(false));
  }, [config.path, isProducts]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((item) =>
          item.nombre.toLowerCase().includes(search.toLowerCase()),
        )
        .filter(
          (item) => !isProducts || !category || item.categoria === category,
        )
        .sort((a, b) =>
          order === "az"
            ? a.nombre.localeCompare(b.nombre)
            : b.nombre.localeCompare(a.nombre),
        ),
    [rows, search, order, category, isProducts],
  );
  const pages = usePagination(filtered, `${search}-${order}-${category}`);
  const save = async () => {
    try {
      editing
        ? await api.put(`/${config.path}/${editing}`, form)
        : await api.post(`/${config.path}`, form);
      setFormOpen(false);
      load();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    }
  };
  const remove = (id) =>
    Alert.alert("Eliminar", "¿Seguro que querés eliminar este registro?", [
      { text: "Cancelar" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await api.patch(`/${config.path}/${id}/desactivar`);
          load();
        },
      },
    ]);
  const header = (
    <>
      <Header
        title={config.title}
        subtitle={`${filtered.length} registros`}
        action={
          <IconButton
            icon="add"
            active
            onPress={() => {
              setEditing(null);
              setForm({
                ...config.defaults,
                categoria: categories[0]?.nombre || config.defaults.categoria,
              });
              setFormOpen(true);
            }}
          />
        }
      />
      {isProducts ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.categoryStrip}
          >
            {categories.map((item) => (
              <Pressable
                key={item.id_categoria}
                onPress={() => setCategory(item.nombre)}
                style={[s.chip, category === item.nombre && s.chipActive]}
              >
                <Text
                  style={
                    category === item.nombre ? s.chipTextActive : s.chipText
                  }
                >
                  {item.nombre}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button
            compact
            secondary
            icon="add-circle-outline"
            title="Administrar categorías"
            onPress={() => navigation.navigate("CategoriasProductos")}
          />
        </>
      ) : null}
      <SearchToolbar
        value={search}
        onChange={setSearch}
        order={order}
        onOrder={() => setOrder((current) => (current === "az" ? "za" : "az"))}
      />
      {route.name === "Insumos" ? (
        <Button
          secondary
          icon="calculator-outline"
          title="Calculadora de costos"
          onPress={() => navigation.navigate("Calculadora")}
        />
      ) : null}
    </>
  );
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) =>
          String(item[Object.keys(item).find((key) => key.startsWith("id_"))])
        }
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <Loading /> : <Empty />}
        renderItem={({ item }) => {
          const id =
            item[Object.keys(item).find((key) => key.startsWith("id_"))];
          return (
            <Card>
              <Text style={s.cardTitle}>{item.nombre}</Text>
              {item.precio_venta !== undefined ? (
                <>
                  <Text style={s.amount}>{money(item.precio_venta)}</Text>
                  <Text style={s.meta}>
                    {item.categoria} · Stock {item.stock_actual}
                  </Text>
                </>
              ) : null}
              {item.telefono !== undefined ? (
                <>
                  <Text style={s.meta}>
                    {item.telefono || "Sin teléfono"} ·{" "}
                    {item.direccion || "Sin dirección"}
                  </Text>
                  {item.latitud != null ? (
                    <Text style={s.geoReady}>
                      ● Ubicación confirmada para reparto
                    </Text>
                  ) : null}
                </>
              ) : null}
              {item.precio_referencia !== undefined ? (
                <Text style={s.meta}>
                  {money(item.precio_referencia)} por {item.cantidad_referencia}{" "}
                  {item.unidad_referencia}
                </Text>
              ) : null}
              <View style={s.actionRow}>
                {config.path === "clientes" ? (
                  <IconButton
                    icon="analytics-outline"
                    onPress={() =>
                      navigation.navigate("HistorialCliente", { idCliente: id })
                    }
                  />
                ) : null}
                <Button
                  compact
                  secondary
                  icon="create-outline"
                  title="Editar"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setEditing(id);
                    setForm({ ...item });
                    setFormOpen(true);
                  }}
                />
                <IconButton
                  danger
                  icon="trash-outline"
                  onPress={() => remove(id)}
                />
              </View>
            </Card>
          );
        }}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
      <CrudModal
        visible={formOpen}
        config={config}
        categories={categories}
        form={form}
        setForm={setForm}
        editing={editing}
        onLocation={() => setLocationOpen(true)}
        onClose={() => setFormOpen(false)}
        onSave={save}
      />
      <LocationPicker
        visible={locationOpen}
        value={form}
        onClose={() => setLocationOpen(false)}
        onConfirm={(location) => {
          setForm((current) => ({ ...current, ...location }));
          setLocationOpen(false);
        }}
      />
    </Screen>
  );
}

function CrudModal({
  visible,
  config,
  categories = [],
  form,
  setForm,
  editing,
  onLocation,
  onClose,
  onSave,
}) {
  const numeric = (key) =>
    [
      "precio_venta",
      "costo_estimado",
      "stock_actual",
      "precio_referencia",
      "cantidad_referencia",
      "stock_minimo",
    ].includes(key);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Form
        title={
          editing
            ? `Editar ${config.title.toLowerCase()}`
            : `Nuevo ${config.title.toLowerCase()}`
        }
      >
        {config.fields.map(([key, label]) => (
          <Input
            key={key}
            placeholder={label}
            keyboardType={numeric(key) ? "decimal-pad" : "default"}
            value={String(form[key] ?? "")}
            onChangeText={(text) =>
              setForm((current) => ({
                ...current,
                [key]: numeric(key) ? text.replace(",", ".") : text,
              }))
            }
          />
        ))}
        {config.path === "clientes" ? (
          <Card style={{ backgroundColor: colors.primarySoft }}>
            <Text style={s.cardTitle}>Ubicación para reparto</Text>
            <Text style={s.meta}>
              {form.latitud != null
                ? "Punto confirmado. Podés volver a ajustarlo en el mapa."
                : "Elegí el punto exacto aunque la calle no figure correctamente."}
            </Text>
            <Button
              secondary
              icon="map-outline"
              title={
                form.latitud != null ? "Ajustar ubicación" : "Elegir en el mapa"
              }
              onPress={onLocation}
            />
          </Card>
        ) : null}
        {config.path === "productos" ? (
          <>
            <Text style={s.label}>Categoría</Text>
            <View style={s.chips}>
              {categories.map((item) => (
                <Pressable
                  key={item.id_categoria}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      categoria: item.nombre,
                    }))
                  }
                  style={[
                    s.chip,
                    form.categoria === item.nombre && s.chipActive,
                  ]}
                >
                  <Text
                    style={
                      form.categoria === item.nombre
                        ? s.chipTextActive
                        : s.chipText
                    }
                  >
                    {item.nombre}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        {config.path === "insumos" ? (
          <>
            <Text style={s.label}>Tipo y unidad</Text>
            <View style={s.chips}>
              {[
                ["peso", "g"],
                ["volumen", "ml"],
                ["unidad", "unidad"],
              ].map(([type, unit]) => (
                <Pressable
                  key={type}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      tipo_medida: type,
                      unidad_referencia: unit,
                    }))
                  }
                  style={[s.chip, form.tipo_medida === type && s.chipActive]}
                >
                  <Text
                    style={
                      form.tipo_medida === type ? s.chipTextActive : s.chipText
                    }
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        <Button icon="checkmark" title="Guardar" onPress={onSave} />
        <Button secondary title="Cancelar" onPress={onClose} />
      </Form>
    </Modal>
  );
}

export function CategoriasProductos() {
  const [rows, setRows] = useState([]),
    [name, setName] = useState("");
  const load = useCallback(
    () => api.get("/categorias-productos").then((r) => setRows(r.data.data)),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const add = async () => {
    try {
      await api.post("/categorias-productos", { nombre: name });
      setName("");
      load();
    } catch (error) {
      Alert.alert("No se pudo crear", message(error));
    }
  };
  const remove = (id) =>
    Alert.alert(
      "Desactivar categoría",
      "Solo se puede desactivar si no tiene productos activos.",
      [
        { text: "Cancelar" },
        {
          text: "Desactivar",
          onPress: async () => {
            try {
              await api.patch(`/categorias-productos/${id}/desactivar`);
              load();
            } catch (error) {
              Alert.alert("No se pudo desactivar", message(error));
            }
          },
        },
      ],
    );
  const pages = usePagination(rows, rows.length);
  return (
    <Form title="Categorías de productos">
      <Card>
        <Text style={s.meta}>
          Creá categorías propias para adaptar la aplicación a cualquier
          comercio.
        </Text>
        <Input
          icon="pricetags-outline"
          placeholder="Nueva categoría"
          value={name}
          onChangeText={setName}
        />
        <Button
          icon="add"
          title="Agregar categoría"
          disabled={!name.trim()}
          onPress={add}
        />
      </Card>
      {pages.visible.map((item) => (
        <Card key={item.id_categoria}>
          <View style={s.spaceBetween}>
            <Text style={s.cardTitle}>{item.nombre}</Text>
            <IconButton
              danger
              icon="trash-outline"
              onPress={() => remove(item.id_categoria)}
            />
          </View>
        </Card>
      ))}
      <Pagination {...pages} onChange={pages.setPage} />
    </Form>
  );
}

function StatusPill({ active, text }) {
  return (
    <View style={[s.pill, active && s.pillActive]}>
      <Text style={[s.pillText, active && s.pillTextActive]}>{text}</Text>
    </View>
  );
}

export function Pedidos({ navigation }) {
  const [rows, setRows] = useState([]);
  const [order, setOrder] = useState("fechaAsc");
  const [filter, setFilter] = useState("todos");
  const load = useCallback(
    () =>
      api
        .get("/pedidos")
        .then((response) => setRows(response.data.data))
        .catch((error) => Alert.alert("Error", message(error))),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((item) => filter === "todos" || item.estado === filter)
        .sort((a, b) =>
          order === "fechaAsc"
            ? String(a.fecha_entrega).localeCompare(String(b.fecha_entrega))
            : String(b.fecha_entrega).localeCompare(String(a.fecha_entrega)),
        ),
    [rows, order, filter],
  );
  const pages = usePagination(filtered, `${order}-${filter}`);
  const toggleDelivered = async (item) => {
    await api.patch(`/pedidos/${item.id_pedido}/estado`, {
      estado: item.estado === "entregado" ? "pendiente" : "entregado",
    });
    load();
  };
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) => String(item.id_pedido)}
        ListHeaderComponent={
          <>
            <Header
              title="Pedidos"
              subtitle={`${filtered.length} pedidos`}
              action={
                <IconButton
                  icon="add"
                  active
                  onPress={() => navigation.navigate("NuevoPedido")}
                />
              }
            />
            <View style={s.filterRow}>
              {["todos", "pendiente", "entregado"].map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setFilter(value)}
                  style={[s.chip, filter === value && s.chipActive]}
                >
                  <Text
                    style={filter === value ? s.chipTextActive : s.chipText}
                  >
                    {value}
                  </Text>
                </Pressable>
              ))}
              <IconButton
                icon={
                  order === "fechaAsc"
                    ? "arrow-down-outline"
                    : "arrow-up-outline"
                }
                active
                onPress={() =>
                  setOrder((current) =>
                    current === "fechaAsc" ? "fechaDesc" : "fechaAsc",
                  )
                }
              />
            </View>
          </>
        }
        ListEmptyComponent={<Empty text="No hay pedidos" />}
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <Text style={s.cardTitle}>{item.cliente_nombre}</Text>
              <Text style={s.amount}>{money(item.total)}</Text>
            </View>
            <Text style={s.meta}>{item.detalle_resumido}</Text>
            <Text style={s.meta}>
              Entrega: {String(item.fecha_entrega).slice(0, 10)}
            </Text>
            {item.pagado ? (
              <Text style={s.meta}>Pago: {item.metodo_pago || "efectivo"}</Text>
            ) : null}
            <View style={s.spaceBetween}>
              <Pressable
                onPress={() => toggleDelivered(item)}
                style={[
                  s.deliveryButton,
                  item.estado === "entregado" && s.deliveryActive,
                ]}
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
                    s.deliveryText,
                    item.estado === "entregado" && { color: "#FFF" },
                  ]}
                >
                  {item.estado === "entregado"
                    ? "Entregado"
                    : "Marcar entregado"}
                </Text>
              </Pressable>
              <View style={s.switchWrap}>
                <Text style={s.meta}>Pagado</Text>
                <Switch
                  trackColor={{ true: colors.primary }}
                  value={!!item.pagado}
                  onValueChange={async (value) => {
                    await api.patch(`/pedidos/${item.id_pedido}/pagado`, {
                      pagado: value,
                    });
                    load();
                  }}
                />
              </View>
            </View>
            <View style={s.actionRow}>
              <IconButton
                icon="share-outline"
                onPress={() =>
                  shareOrderReceipt(item.id_pedido).catch((error) =>
                    Alert.alert("No se pudo compartir", message(error)),
                  )
                }
              />
              <Button
                compact
                secondary
                icon="create-outline"
                title="Editar"
                style={{ flex: 1 }}
                onPress={() =>
                  navigation.navigate("NuevoPedido", {
                    idPedido: item.id_pedido,
                  })
                }
              />
              <IconButton
                danger
                icon="trash-outline"
                onPress={() =>
                  Alert.alert(
                    "Eliminar pedido",
                    "¿Eliminar y restaurar su stock?",
                    [
                      { text: "Cancelar" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: async () => {
                          await api.patch(
                            `/pedidos/${item.id_pedido}/desactivar`,
                          );
                          load();
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          </Card>
        )}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
    </Screen>
  );
}

export function Stock() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState("az");
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState([]);
  const load = useCallback(
    () =>
      Promise.all([
        api.get("/productos", { params: { limit: 100 } }),
        api.get("/stock/reposicion"),
      ])
        .then(([response, suggestions]) => {
          setRows(response.data.data);
          setRestock(suggestions.data.data);
        })
        .catch((error) => Alert.alert("Error", message(error))),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((item) =>
          item.nombre.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          order === "az"
            ? a.nombre.localeCompare(b.nombre)
            : b.nombre.localeCompare(a.nombre),
        ),
    [rows, search, order],
  );
  const pages = usePagination(filtered, `${search}-${order}`);
  const move = async (type) => {
    const value = Number(quantity.replace(",", "."));
    if (!Number.isInteger(value) || value < 1)
      return Alert.alert(
        "Cantidad inválida",
        "Ingresá un número entero mayor a cero.",
      );
    try {
      await api.post(`/stock/productos/${selected.id_producto}`, {
        tipo: type,
        cantidad: value,
        motivo: reason || "Ajuste manual",
      });
      setSelected(null);
      setQuantity("");
      setReason("");
      load();
    } catch (error) {
      Alert.alert("No se pudo modificar", message(error));
    }
  };
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) => String(item.id_producto)}
        ListHeaderComponent={
          <>
            <Header title="Stock" subtitle="Control de productos disponibles" />
            {restock.length ? (
              <Card style={s.alertPanel}>
                <Text style={s.alertTitle}>
                  {restock.length} productos para reponer
                </Text>
                <Text style={s.meta}>
                  La sugerencia considera el mínimo configurado y las ventas
                  recientes.
                </Text>
                {restock.slice(0, 3).map((item) => (
                  <Text key={item.id_producto} style={s.alertRowText}>
                    • {item.nombre}: sugerido +{item.sugerido}
                  </Text>
                ))}
              </Card>
            ) : null}
            <SearchToolbar
              value={search}
              onChange={setSearch}
              order={order}
              onOrder={() =>
                setOrder((current) => (current === "az" ? "za" : "az"))
              }
            />
          </>
        }
        ListEmptyComponent={<Empty text="No hay productos" />}
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <View>
                <Text style={s.cardTitle}>{item.nombre}</Text>
                <Text style={s.meta}>{item.categoria}</Text>
                <Text
                  style={
                    Number(item.stock_actual) <= Number(item.stock_minimo)
                      ? s.stockWarning
                      : s.meta
                  }
                >
                  Mínimo: {item.stock_minimo ?? 5}
                </Text>
              </View>
              <View style={s.stockBadge}>
                <Text style={s.stockNumber}>{item.stock_actual}</Text>
                <Text style={s.stockLabel}>unidades</Text>
              </View>
            </View>
            <Button
              compact
              secondary
              icon="options-outline"
              title="Editar stock"
              onPress={() => setSelected(item)}
            />
          </Card>
        )}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <KeyboardDialog>
          <Header
            title={selected?.nombre || ""}
            subtitle={`Stock actual: ${selected?.stock_actual || 0}`}
            action={
              <IconButton icon="close" onPress={() => setSelected(null)} />
            }
          />
          <Input
            icon="layers-outline"
            placeholder="Cantidad"
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
          />
          <Input
            icon="chatbubble-outline"
            placeholder="Motivo (opcional)"
            value={reason}
            onChangeText={setReason}
          />
          <View style={s.actionRow}>
            <Button
              secondary
              icon="remove"
              title="Quitar"
              style={{ flex: 1 }}
              onPress={() => move("quitar")}
            />
            <Button
              icon="add"
              title="Agregar"
              style={{ flex: 1 }}
              onPress={() => move("agregar")}
            />
          </View>
        </KeyboardDialog>
      </Modal>
    </Screen>
  );
}

function LegacyCaja({ navigation }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState("desc");
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [capitalType, setCapitalType] = useState("ingreso");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSummary, setCloseSummary] = useState(null);
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const load = useCallback(() => {
    Promise.all([api.get("/caja/resumen"), api.get("/caja")])
      .then(([a, b]) => {
        setSummary(a.data.data);
        setRows(b.data.data);
      })
      .catch((error) => Alert.alert("Error", message(error)));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((item) => !type || item.tipo === type)
        .filter((item) =>
          item.concepto.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          order === "desc"
            ? String(b.fecha_movimiento).localeCompare(
                String(a.fecha_movimiento),
              )
            : String(a.fecha_movimiento).localeCompare(
                String(b.fecha_movimiento),
              ),
        ),
    [rows, type, search, order],
  );
  const pages = usePagination(filtered, `${type}-${search}-${order}`);
  const saveCapital = async () => {
    try {
      setSaving(true);
      await api.post("/caja/movimientos", {
        tipo: capitalType,
        monto: amount.replace(",", "."),
        descripcion: description,
      });
      setCapitalOpen(false);
      setAmount("");
      setDescription("");
      load();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    } finally {
      setSaving(false);
    }
  };
  const openClose = async () => {
    try {
      const response = await api.get("/caja/cierre/resumen");
      setCloseSummary(response.data.data);
      setCountedCash(String(response.data.data.efectivo_esperado));
      setCloseOpen(true);
    } catch (error) {
      Alert.alert("No se pudo preparar el cierre", message(error));
    }
  };
  const saveClose = async () => {
    try {
      setSaving(true);
      const response = await api.post("/caja/cierres", {
        fecha: closeSummary.fecha,
        efectivo_contado: Number(countedCash.replace(",", ".")),
        observaciones: closeNotes,
      });
      setCloseOpen(false);
      Alert.alert(
        "Caja cerrada",
        `Diferencia: ${money(response.data.data.diferencia)}`,
      );
    } catch (error) {
      Alert.alert("No se pudo cerrar", message(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) => String(item.id_movimiento_caja)}
        ListHeaderComponent={
          <>
            <Header
              title="Caja"
              subtitle="Resumen de tu negocio"
              action={
                <IconButton
                  icon="cart-outline"
                  active
                  onPress={() => navigation.navigate("NuevaCompra")}
                />
              }
            />
            <View style={s.balanceCard}>
              <Text style={s.balanceLabel}>Balance actual</Text>
              <Text style={s.balanceValue}>{money(summary?.balance)}</Text>
              <View style={s.balanceDetails}>
                <View>
                  <Text style={s.balanceSmall}>Ingresos</Text>
                  <Text style={s.income}>{money(summary?.ingresos)}</Text>
                </View>
                <View>
                  <Text style={s.balanceSmall}>Egresos</Text>
                  <Text style={s.expense}>{money(summary?.egresos)}</Text>
                </View>
              </View>
            </View>
            <Button
              secondary
              icon="swap-vertical-outline"
              title="Aportar o retirar capital"
              onPress={() => setCapitalOpen(true)}
            />
            <Button
              icon="lock-closed-outline"
              title="Realizar cierre diario"
              onPress={openClose}
            />
            <View style={s.filterRow}>
              {[
                ["", "Todos"],
                ["ingreso", "Ingresos"],
                ["egreso", "Egresos"],
              ].map(([value, label]) => (
                <Pressable
                  key={label}
                  onPress={() => setType(value)}
                  style={[s.chip, type === value && s.chipActive]}
                >
                  <Text style={type === value ? s.chipTextActive : s.chipText}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <SearchToolbar
              value={search}
              onChange={setSearch}
              order={order}
              onOrder={() =>
                setOrder((current) => (current === "desc" ? "asc" : "desc"))
              }
            />
            <Text style={s.sectionTitle}>Movimientos</Text>
          </>
        }
        ListEmptyComponent={<Empty text="Todavía no hay movimientos" />}
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{item.concepto}</Text>
                <Text style={s.meta}>
                  {String(item.fecha_movimiento).replace("T", " ").slice(0, 16)}{" "}
                  · {item.origen}
                </Text>
                <Text style={s.meta}>
                  Método: {item.metodo_pago || "efectivo"}
                </Text>
              </View>
              <Text
                style={[
                  s.movementAmount,
                  item.tipo === "ingreso" ? s.income : s.expense,
                ]}
              >
                {item.tipo === "ingreso" ? "+" : "−"} {money(item.monto)}
              </Text>
            </View>
            {item.anulado ? <StatusPill text="Anulado" /> : null}
          </Card>
        )}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
      <Modal
        visible={capitalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCapitalOpen(false)}
      >
        <KeyboardDialog>
          <Header
            title="Movimiento de capital"
            subtitle="Quedará registrado en el historial"
            action={
              <IconButton icon="close" onPress={() => setCapitalOpen(false)} />
            }
          />
          <View style={s.segment}>
            <Pressable
              onPress={() => setCapitalType("ingreso")}
              style={[
                s.segmentButton,
                capitalType === "ingreso" && s.segmentActive,
              ]}
            >
              <Text
                style={[
                  s.segmentText,
                  capitalType === "ingreso" && s.segmentTextActive,
                ]}
              >
                Aporte
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCapitalType("egreso")}
              style={[
                s.segmentButton,
                capitalType === "egreso" && s.segmentActive,
              ]}
            >
              <Text
                style={[
                  s.segmentText,
                  capitalType === "egreso" && s.segmentTextActive,
                ]}
              >
                Retiro
              </Text>
            </Pressable>
          </View>
          <Input
            icon="cash-outline"
            placeholder="Monto"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Input
            icon="document-text-outline"
            placeholder="Descripción"
            value={description}
            onChangeText={setDescription}
          />
          <Button
            icon="checkmark"
            title={saving ? "Guardando…" : "Guardar movimiento"}
            disabled={saving}
            onPress={saveCapital}
          />
        </KeyboardDialog>
      </Modal>
      <Modal
        visible={closeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseOpen(false)}
      >
        <KeyboardDialog>
          <Header
            title="Cierre diario"
            subtitle={closeSummary?.fecha}
            action={
              <IconButton icon="close" onPress={() => setCloseOpen(false)} />
            }
          />
          {Object.entries(closeSummary?.metodos || {}).map(
            ([method, value]) => (
              <View key={method} style={s.spaceBetween}>
                <Text style={s.meta}>{method}</Text>
                <Text style={s.amount}>{money(value.neto)}</Text>
              </View>
            ),
          )}
          <Card style={{ marginTop: 12 }}>
            <Text style={s.cardTitle}>Efectivo esperado</Text>
            <Text style={s.totalValue}>
              {money(closeSummary?.efectivo_esperado)}
            </Text>
          </Card>
          <Input
            icon="cash-outline"
            placeholder="Efectivo contado"
            keyboardType="decimal-pad"
            value={countedCash}
            onChangeText={setCountedCash}
          />
          <Input
            icon="document-text-outline"
            placeholder="Observaciones (opcional)"
            value={closeNotes}
            onChangeText={setCloseNotes}
          />
          <Button
            icon="checkmark"
            title={saving ? "Cerrando…" : "Confirmar cierre"}
            disabled={saving}
            onPress={saveClose}
          />
        </KeyboardDialog>
      </Modal>
    </Screen>
  );
}

function LegacyNuevoPedido({ navigation, route }) {
  const orderId = route?.params?.idPedido;
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [client, setClient] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paid, setPaid] = useState(false);
  const [state, setState] = useState("pendiente");
  const [busy, setBusy] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    observacion: "",
  });
  const [clientBusy, setClientBusy] = useState(false);
  useEffect(() => {
    const requests = [
      api.get("/clientes", { params: { limit: 100 } }),
      api.get("/productos", { params: { limit: 100 } }),
    ];
    if (orderId) requests.push(api.get(`/pedidos/${orderId}`));
    Promise.all(requests).then(([a, b, order]) => {
      setClients(a.data.data);
      setProducts(b.data.data);
      if (order) {
        const value = order.data.data;
        setClient(value.id_cliente);
        setDate(String(value.fecha_entrega).slice(0, 10));
        setPaid(!!value.pagado);
        setState(value.estado);
        setQuantities(
          Object.fromEntries(
            value.detalles.map((item) => [item.id_producto, item.cantidad]),
          ),
        );
      }
    });
  }, [orderId]);
  const shownClients = clients
    .filter((item) =>
      item.nombre.toLowerCase().includes(clientSearch.toLowerCase()),
    )
    .slice(0, 5);
  const shownProducts = products
    .filter((item) =>
      item.nombre.toLowerCase().includes(productSearch.toLowerCase()),
    )
    .slice(0, 5);
  const total = products.reduce(
    (sum, item) =>
      sum +
      Number(item.precio_venta) * Number(quantities[item.id_producto] || 0),
    0,
  );
  const save = async () => {
    const body = {
      id_cliente: client,
      fecha_entrega: date,
      estado: state,
      pagado: paid,
      detalles: Object.entries(quantities)
        .filter(([, value]) => value > 0)
        .map(([id, value]) => ({ id_producto: Number(id), cantidad: value })),
    };
    try {
      setBusy(true);
      orderId
        ? await api.put(`/pedidos/${orderId}`, body)
        : await api.post("/pedidos", body);
      navigation.goBack();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const saveClient = async () => {
    try {
      setClientBusy(true);
      const response = await api.post("/clientes", newClient);
      const created = {
        ...newClient,
        id_cliente: response.data.data.id_cliente,
      };
      setClients((current) => [created, ...current]);
      setClient(created.id_cliente);
      setNewClient({
        nombre: "",
        telefono: "",
        direccion: "",
        observacion: "",
      });
      setClientOpen(false);
    } catch (error) {
      Alert.alert("No se pudo crear el cliente", message(error));
    } finally {
      setClientBusy(false);
    }
  };
  return (
    <Form title={orderId ? "Editar pedido" : "Nuevo pedido"}>
      <View style={s.spaceBetween}>
        <Text style={s.label}>1. Elegí un cliente</Text>
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
        onChangeText={setClientSearch}
      />
      {shownClients.map((item) => (
        <Pressable
          key={item.id_cliente}
          onPress={() => setClient(item.id_cliente)}
          style={[s.selectRow, client === item.id_cliente && s.selectRowActive]}
        >
          <Text style={s.selectText}>{item.nombre}</Text>
          {client === item.id_cliente ? (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={colors.primary}
            />
          ) : null}
        </Pressable>
      ))}
      <Text style={s.label}>2. Agregá productos</Text>
      <Input
        icon="search-outline"
        placeholder="Buscar producto"
        value={productSearch}
        onChangeText={setProductSearch}
      />
      {shownProducts.map((item) => (
        <View key={item.id_producto} style={s.productRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{item.nombre}</Text>
            <Text style={s.meta}>
              {money(item.precio_venta)} · Stock {item.stock_actual}
            </Text>
          </View>
          <View style={s.counter}>
            <IconButton
              icon="remove"
              onPress={() =>
                setQuantities((current) => ({
                  ...current,
                  [item.id_producto]: Math.max(
                    0,
                    (current[item.id_producto] || 0) - 1,
                  ),
                }))
              }
            />
            <Text style={s.counterText}>
              {quantities[item.id_producto] || 0}
            </Text>
            <IconButton
              icon="add"
              active
              onPress={() =>
                setQuantities((current) => ({
                  ...current,
                  [item.id_producto]: (current[item.id_producto] || 0) + 1,
                }))
              }
            />
          </View>
        </View>
      ))}
      <Text style={s.label}>3. Entrega y pago</Text>
      <Input
        icon="calendar-outline"
        placeholder="AAAA-MM-DD"
        value={date}
        onChangeText={setDate}
      />
      {orderId ? (
        <View style={s.segment}>
          <Pressable
            onPress={() => setState("pendiente")}
            style={[s.segmentButton, state === "pendiente" && s.segmentActive]}
          >
            <Text
              style={[
                s.segmentText,
                state === "pendiente" && s.segmentTextActive,
              ]}
            >
              Pendiente
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setState("entregado")}
            style={[s.segmentButton, state === "entregado" && s.segmentActive]}
          >
            <Text
              style={[
                s.segmentText,
                state === "entregado" && s.segmentTextActive,
              ]}
            >
              Entregado
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={s.optionRow}>
        <View>
          <Text style={s.cardTitle}>Pedido pagado</Text>
          <Text style={s.meta}>Genera un ingreso en caja</Text>
        </View>
        <Switch
          trackColor={{ true: colors.primary }}
          value={paid}
          onValueChange={setPaid}
        />
      </View>
      <View style={s.totalBar}>
        <Text style={s.totalLabel}>Total estimado</Text>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
      <Button
        icon="checkmark"
        title={busy ? "Guardando…" : "Guardar pedido"}
        disabled={busy}
        onPress={save}
      />
      <Modal
        visible={clientOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClientOpen(false)}
      >
        <KeyboardDialog>
          <Header
            title="Nuevo cliente"
            subtitle="Se seleccionará automáticamente"
            action={
              <IconButton icon="close" onPress={() => setClientOpen(false)} />
            }
          />
          <Input
            icon="person-outline"
            placeholder="Nombre"
            value={newClient.nombre}
            onChangeText={(value) =>
              setNewClient((current) => ({ ...current, nombre: value }))
            }
          />
          <Input
            icon="call-outline"
            placeholder="Teléfono (opcional)"
            value={newClient.telefono}
            onChangeText={(value) =>
              setNewClient((current) => ({ ...current, telefono: value }))
            }
          />
          <Input
            icon="location-outline"
            placeholder="Dirección (opcional)"
            value={newClient.direccion}
            onChangeText={(value) =>
              setNewClient((current) => ({ ...current, direccion: value }))
            }
          />
          <Input
            icon="document-text-outline"
            placeholder="Observación (opcional)"
            value={newClient.observacion}
            onChangeText={(value) =>
              setNewClient((current) => ({ ...current, observacion: value }))
            }
          />
          <Button
            icon="checkmark"
            title={clientBusy ? "Guardando…" : "Crear cliente"}
            disabled={clientBusy}
            onPress={saveClient}
          />
        </KeyboardDialog>
      </Modal>
    </Form>
  );
}

export function Caja(props) {
  return (
    <View style={{ flex: 1 }}>
      <LegacyCaja {...props} />
      <Pressable
        style={s.reportFab}
        onPress={() => props.navigation.navigate("Informes")}
      >
        <Ionicons name="stats-chart" size={19} color="#FFF" />
        <Text style={s.reportFabText}>Informes</Text>
      </Pressable>
    </View>
  );
}

export function NuevoPedido({ navigation, route }) {
  const orderId = route?.params?.idPedido,
    [clients, setClients] = useState([]),
    [products, setProducts] = useState([]),
    [clientSearch, setClientSearch] = useState(""),
    [productSearch, setProductSearch] = useState(""),
    [client, setClient] = useState(null),
    [quantities, setQuantities] = useState({}),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [paid, setPaid] = useState(false),
    [paymentMethod, setPaymentMethod] = useState("efectivo"),
    [state, setState] = useState("pendiente"),
    [discountType, setDiscountType] = useState("porcentaje"),
    [discountValue, setDiscountValue] = useState(""),
    [busy, setBusy] = useState(false),
    [clientOpen, setClientOpen] = useState(false),
    [newClient, setNewClient] = useState({
      nombre: "",
      telefono: "",
      direccion: "",
      observacion: "",
    }),
    [clientBusy, setClientBusy] = useState(false);
  useEffect(() => {
    const requests = [
      api.get("/clientes", { params: { limit: 100 } }),
      api.get("/productos", { params: { limit: 100 } }),
    ];
    if (orderId) requests.push(api.get(`/pedidos/${orderId}`));
    Promise.all(requests)
      .then(([a, b, order]) => {
        setClients(a.data.data);
        setProducts(b.data.data);
        if (order) {
          const v = order.data.data;
          setClient(v.id_cliente);
          setDate(String(v.fecha_entrega).slice(0, 10));
          setPaid(!!v.pagado);
          setPaymentMethod(v.metodo_pago || "efectivo");
          setState(v.estado);
          setDiscountType(v.descuento_tipo || "porcentaje");
          setDiscountValue(v.descuento_valor ? String(v.descuento_valor) : "");
          setQuantities(
            Object.fromEntries(
              v.detalles.map((item) => [item.id_producto, item.cantidad]),
            ),
          );
        }
      })
      .catch((error) => Alert.alert("Error", message(error)));
  }, [orderId]);
  const filteredClients = clients.filter((i) =>
      i.nombre.toLowerCase().includes(clientSearch.toLowerCase()),
    ),
    filteredProducts = products.filter((i) =>
      i.nombre.toLowerCase().includes(productSearch.toLowerCase()),
    ),
    clientPages = usePagination(filteredClients, clientSearch),
    productPages = usePagination(filteredProducts, productSearch),
    subtotal = products.reduce(
      (sum, i) =>
        sum + Number(i.precio_venta) * Number(quantities[i.id_producto] || 0),
      0,
    ),
    dv = Number(discountValue || 0),
    discount = Math.min(
      subtotal,
      discountType === "porcentaje" ? (subtotal * dv) / 100 : dv,
    ),
    total = Math.max(0, subtotal - discount);
  const send = async () => {
    const body = {
      id_cliente: client,
      fecha_entrega: date,
      estado: state,
      pagado: paid,
      metodo_pago: paymentMethod,
      descuento_tipo: discountValue ? discountType : null,
      descuento_valor: discountValue || 0,
      detalles: Object.entries(quantities)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => ({ id_producto: Number(id), cantidad: v })),
    };
    try {
      setBusy(true);
      orderId
        ? await api.put(`/pedidos/${orderId}`, body)
        : await api.post("/pedidos", body);
      navigation.goBack();
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const shortages = products.filter(
      (i) => Number(quantities[i.id_producto] || 0) > Number(i.stock_actual),
    );
    if (shortages.length)
      return Alert.alert(
        "Productos sin stock suficiente",
        `${shortages.map((i) => `${i.nombre}: disponible ${i.stock_actual}, pedido ${quantities[i.id_producto]}`).join("\n")}\n\nAl crear el pedido, la reserva hará que el stock quede negativo.`,
        [
          { text: "Revisar pedido", style: "cancel" },
          { text: "Crear igualmente", onPress: send },
        ],
      );
    send();
  };
  const saveClient = async () => {
    try {
      setClientBusy(true);
      const r = await api.post("/clientes", newClient),
        created = { ...newClient, id_cliente: r.data.data.id_cliente };
      setClients((current) => [created, ...current]);
      setClient(created.id_cliente);
      setNewClient({
        nombre: "",
        telefono: "",
        direccion: "",
        observacion: "",
      });
      setClientOpen(false);
    } catch (error) {
      Alert.alert("No se pudo crear el cliente", message(error));
    } finally {
      setClientBusy(false);
    }
  };
  return (
    <Form title={orderId ? "Editar pedido" : "Nuevo pedido"}>
      <View style={s.spaceBetween}>
        <Text style={s.label}>1. Elegí un cliente</Text>
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
        onChangeText={setClientSearch}
      />
      {clientPages.visible.map((i) => (
        <Pressable
          key={i.id_cliente}
          onPress={() => setClient(i.id_cliente)}
          style={[s.selectRow, client === i.id_cliente && s.selectRowActive]}
        >
          <Text style={s.selectText}>{i.nombre}</Text>
          {client === i.id_cliente ? (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={colors.primary}
            />
          ) : null}
        </Pressable>
      ))}
      <Pagination {...clientPages} onChange={clientPages.setPage} />
      <Text style={s.label}>2. Agregá productos</Text>
      <Input
        icon="search-outline"
        placeholder="Buscar producto"
        value={productSearch}
        onChangeText={setProductSearch}
      />
      {productPages.visible.map((i) => (
        <View key={i.id_producto} style={s.productRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{i.nombre}</Text>
            <Text style={[s.meta, i.stock_actual <= 0 && s.stockWarning]}>
              {money(i.precio_venta)} · Stock {i.stock_actual}
            </Text>
          </View>
          <View style={s.counter}>
            <IconButton
              icon="remove"
              onPress={() =>
                setQuantities((c) => ({
                  ...c,
                  [i.id_producto]: Math.max(0, (c[i.id_producto] || 0) - 1),
                }))
              }
            />
            <Text style={s.counterText}>{quantities[i.id_producto] || 0}</Text>
            <IconButton
              icon="add"
              active
              onPress={() =>
                setQuantities((c) => ({
                  ...c,
                  [i.id_producto]: (c[i.id_producto] || 0) + 1,
                }))
              }
            />
          </View>
        </View>
      ))}
      <Pagination {...productPages} onChange={productPages.setPage} />
      <Text style={s.label}>3. Entrega, pago y descuento</Text>
      <DateField value={date} onChange={setDate} />
      <View style={s.optionRow}>
        <View>
          <Text style={s.cardTitle}>Pedido pagado</Text>
          <Text style={s.meta}>Genera un ingreso en caja</Text>
        </View>
        <Switch
          trackColor={{ true: colors.primary }}
          value={paid}
          onValueChange={setPaid}
        />
      </View>
      {paid ? (
        <PaymentField value={paymentMethod} onChange={setPaymentMethod} />
      ) : null}
      <View style={s.optionRow}>
        <View>
          <Text style={s.cardTitle}>Pedido entregado</Text>
          <Text style={s.meta}>
            El stock ya quedó reservado al crear el pedido
          </Text>
        </View>
        <Switch
          trackColor={{ true: colors.primary }}
          value={state === "entregado"}
          onValueChange={(v) => setState(v ? "entregado" : "pendiente")}
        />
      </View>
      <DiscountField
        type={discountType}
        setType={setDiscountType}
        value={discountValue}
        setValue={setDiscountValue}
      />
      <View style={s.totalBar}>
        <View>
          <Text style={s.totalLabel}>Subtotal {money(subtotal)}</Text>
          {discount > 0 ? (
            <Text style={s.meta}>Descuento −{money(discount)}</Text>
          ) : null}
        </View>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
      <Button
        icon="checkmark"
        title={busy ? "Guardando…" : "Guardar pedido"}
        disabled={busy}
        onPress={save}
      />
      <Modal
        visible={clientOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClientOpen(false)}
      >
        <KeyboardDialog>
          <Header
            title="Nuevo cliente"
            subtitle="Se seleccionará automáticamente"
            action={
              <IconButton icon="close" onPress={() => setClientOpen(false)} />
            }
          />
          {[
            ["nombre", "person-outline", "Nombre"],
            ["telefono", "call-outline", "Teléfono (opcional)"],
            ["direccion", "location-outline", "Dirección (opcional)"],
            ["observacion", "document-text-outline", "Observación (opcional)"],
          ].map(([key, icon, label]) => (
            <Input
              key={key}
              icon={icon}
              placeholder={label}
              value={newClient[key]}
              onChangeText={(v) => setNewClient((c) => ({ ...c, [key]: v }))}
            />
          ))}
          <Button
            icon="checkmark"
            title={clientBusy ? "Guardando…" : "Crear cliente"}
            disabled={clientBusy}
            onPress={saveClient}
          />
        </KeyboardDialog>
      </Modal>
    </Form>
  );
}

function LegacyNuevaCompra({ navigation }) {
  const [supplies, setSupplies] = useState([]);
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get("/insumos", { params: { limit: 100 } })
      .then((response) => setSupplies(response.data.data));
  }, []);
  const visible = supplies
    .filter((item) => item.nombre.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 6);
  const total = supplies.reduce(
    (sum, item) =>
      sum +
      Number(quantities[item.id_insumo] || 0) *
        Number(prices[item.id_insumo] ?? item.precio_referencia),
    0,
  );
  const save = async () => {
    try {
      setBusy(true);
      await api.post("/compras", {
        proveedor: provider,
        fecha_compra: new Date().toISOString().slice(0, 10),
        detalles: supplies
          .filter((item) => Number(quantities[item.id_insumo]) > 0)
          .map((item) => ({
            id_insumo: item.id_insumo,
            cantidad: Number(quantities[item.id_insumo]),
            precio_unitario: Number(
              prices[item.id_insumo] ?? item.precio_referencia,
            ),
          })),
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert("No se pudo registrar", message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Form title="Nueva compra">
      <Input
        icon="storefront-outline"
        placeholder="Local o proveedor"
        value={provider}
        onChangeText={setProvider}
      />
      <Input
        icon="search-outline"
        placeholder="Buscar insumo"
        value={search}
        onChangeText={setSearch}
      />
      {visible.map((item) => (
        <Card key={item.id_insumo}>
          <Text style={s.cardTitle}>{item.nombre}</Text>
          <View style={s.twoColumns}>
            <Input
              style={{ flex: 1 }}
              placeholder="Cantidad"
              keyboardType="decimal-pad"
              value={quantities[item.id_insumo] || ""}
              onChangeText={(value) =>
                setQuantities((current) => ({
                  ...current,
                  [item.id_insumo]: value.replace(",", "."),
                }))
              }
            />
            <Input
              style={{ flex: 1 }}
              placeholder="Precio"
              keyboardType="decimal-pad"
              value={String(prices[item.id_insumo] ?? item.precio_referencia)}
              onChangeText={(value) =>
                setPrices((current) => ({
                  ...current,
                  [item.id_insumo]: value.replace(",", "."),
                }))
              }
            />
          </View>
        </Card>
      ))}
      <View style={s.totalBar}>
        <Text style={s.totalLabel}>Total de compra</Text>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
      <Button
        icon="checkmark"
        title={busy ? "Registrando…" : "Registrar compra"}
        disabled={busy}
        onPress={save}
      />
    </Form>
  );
}

export function NuevaCompra({ navigation }) {
  const [supplies, setSupplies] = useState([]),
    [provider, setProvider] = useState(""),
    [search, setSearch] = useState(""),
    [quantities, setQuantities] = useState({}),
    [prices, setPrices] = useState({}),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [paymentMethod, setPaymentMethod] = useState("efectivo"),
    [discountType, setDiscountType] = useState("porcentaje"),
    [discountValue, setDiscountValue] = useState(""),
    [busy, setBusy] = useState(false),
    [ticketBusy, setTicketBusy] = useState(false),
    [ticketImage, setTicketImage] = useState(null),
    [ticket, setTicket] = useState(null),
    [priorityIds, setPriorityIds] = useState([]),
    [ticketOpen, setTicketOpen] = useState(false);
  const loadSupplies = useCallback(
    () =>
      api.get("/insumos", { params: { limit: 500 } }).then((r) => {
        setSupplies(r.data.data);
        return r.data.data;
      }),
    [],
  );
  useEffect(() => {
    loadSupplies();
  }, [loadSupplies]);
  const orderedSupplies = useMemo(() => {
      const priority = new Map(
        priorityIds.map((id, index) => [Number(id), index]),
      );
      return [...supplies].sort((a, b) => {
        const aSelected = Number(quantities[a.id_insumo] || 0) > 0,
          bSelected = Number(quantities[b.id_insumo] || 0) > 0;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        const ai = priority.get(Number(a.id_insumo)),
          bi = priority.get(Number(b.id_insumo));
        if (ai !== undefined || bi !== undefined)
          return (ai ?? 999999) - (bi ?? 999999);
        return a.nombre.localeCompare(b.nombre);
      });
    }, [supplies, quantities, priorityIds]),
    filteredSupplies = orderedSupplies.filter((i) =>
      i.nombre.toLowerCase().includes(search.toLowerCase()),
    ),
    subtotal = supplies.reduce(
      (sum, i) =>
        sum +
        Number(quantities[i.id_insumo] || 0) *
          Number(prices[i.id_insumo] ?? i.precio_referencia),
      0,
    ),
    dv = Number(discountValue || 0),
    discount = Math.min(
      subtotal,
      discountType === "porcentaje" ? (subtotal * dv) / 100 : dv,
    ),
    total = subtotal - discount;
  const purchasePages = usePagination(
    filteredSupplies,
    `${search}-${priorityIds.join("-")}-${Object.keys(quantities)
      .filter((id) => Number(quantities[id]) > 0)
      .join("-")}`,
  );
  const ticketPages = usePagination(
    ticket?.items || [],
    ticket?.items?.length || 0,
  );
  const save = async () => {
    try {
      setBusy(true);
      await api.post("/compras", {
        proveedor: provider,
        fecha_compra: date,
        metodo_pago: paymentMethod,
        descuento_tipo: discountValue ? discountType : null,
        descuento_valor: discountValue || 0,
        detalles: supplies
          .filter((i) => Number(quantities[i.id_insumo]) > 0)
          .map((i) => ({
            id_insumo: i.id_insumo,
            cantidad: Number(quantities[i.id_insumo]),
            precio_unitario: Number(prices[i.id_insumo] ?? i.precio_referencia),
          })),
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert("No se pudo registrar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const scan = async (camera) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          return Alert.alert(
            "Permiso necesario",
            "Habilitá la cámara para fotografiar el comprobante.",
          );
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          return Alert.alert(
            "Permiso necesario",
            "Habilitá el acceso a fotos para elegir el comprobante.",
          );
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
          });
      if (result.canceled) return;
      setTicketBusy(true);
      const original = result.assets[0],
        compressed = await ImageManipulator.manipulateAsync(
          original.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.76, format: ImageManipulator.SaveFormat.JPEG },
        );
      setTicketImage(compressed.uri);
      const form = new FormData();
      form.append("ticket", {
        uri: compressed.uri,
        name: "ticket.jpg",
        type: "image/jpeg",
      });
      const response = await api.post("/tickets/analizar", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });
      setTicket({
        ...response.data.data,
        items: response.data.data.items.map((item) => ({
          ...item,
          nombre_editado: item.nombre,
          id_insumo: item.id_insumo_sugerido,
        })),
      });
      setTicketOpen(true);
    } catch (error) {
      Alert.alert(
        "No se pudo leer el ticket",
        error.code === "ECONNABORTED"
          ? "La lectura tardó demasiado. Probá con una foto más recortada y nítida."
          : message(error),
      );
    } finally {
      setTicketBusy(false);
    }
  };
  const applyTicket = async () => {
    try {
      setTicketBusy(true);
      const nextSupplies = [...supplies],
        nextQuantities = { ...quantities },
        nextPrices = { ...prices };
      const appliedIds = [];
      for (const item of ticket.items) {
        let id = Number(item.id_insumo) || null;
        if (!id) {
          const created = await api.post("/insumos", {
            nombre: String(item.nombre_editado || item.nombre).trim(),
            descripcion: "Creado desde lectura de ticket",
            precio_referencia: Number(item.precio_unitario || 0),
            cantidad_referencia: 1,
            unidad_referencia: "unidad",
            tipo_medida: "unidad",
            fecha_precio: ticket.fecha || new Date().toISOString().slice(0, 10),
          });
          id = created.data.data.id_insumo;
          nextSupplies.push({
            id_insumo: id,
            nombre: String(item.nombre_editado || item.nombre).trim(),
            precio_referencia: Number(item.precio_unitario || 0),
            cantidad_referencia: 1,
            unidad_referencia: "unidad",
            tipo_medida: "unidad",
          });
        }
        nextQuantities[id] = String(
          Number(nextQuantities[id] || 0) + Number(item.cantidad || 1),
        );
        nextPrices[id] = String(Number(item.precio_unitario || 0));
        appliedIds.push(id);
      }
      setSupplies(nextSupplies);
      setQuantities(nextQuantities);
      setPrices(nextPrices);
      setPriorityIds((current) => [...new Set([...appliedIds, ...current])]);
      if (ticket.proveedor) setProvider(ticket.proveedor);
      if (ticket.fecha) setDate(ticket.fecha);
      setTicketOpen(false);
      Alert.alert(
        "Borrador aplicado",
        "Revisá cantidades, precios y total antes de registrar la compra.",
      );
    } catch (error) {
      Alert.alert("No se pudo aplicar el ticket", message(error));
    } finally {
      setTicketBusy(false);
    }
  };
  const chooseSupply = (index, id) =>
      setTicket((current) => ({
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, id_insumo: id } : item,
        ),
      })),
    editTicketName = (index, value) =>
      setTicket((current) => ({
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, nombre_editado: value } : item,
        ),
      })),
    removeTicketItem = (index) =>
      setTicket((current) => ({
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      }));
  return (
    <Form title="Nueva compra">
      <Card style={s.ticketCard}>
        <View style={s.ticketIntro}>
          <View style={s.ticketIcon}>
            <Ionicons name="sparkles" size={23} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Cargar desde un ticket</Text>
            <Text style={s.meta}>
              La IA crea un borrador; siempre lo revisás antes de guardar.
            </Text>
          </View>
        </View>
        {ticketBusy ? (
          <Loading />
        ) : (
          <View style={s.twoColumns}>
            <Button
              compact
              icon="camera-outline"
              title="Sacar foto"
              style={{ flex: 1 }}
              onPress={() => scan(true)}
            />
            <Button
              compact
              secondary
              icon="images-outline"
              title="Galería"
              style={{ flex: 1 }}
              onPress={() => scan(false)}
            />
          </View>
        )}
      </Card>
      <Input
        icon="storefront-outline"
        placeholder="Local o proveedor"
        value={provider}
        onChangeText={setProvider}
      />
      <Text style={s.label}>Fecha de compra</Text>
      <DateField value={date} onChange={setDate} />
      <Input
        icon="search-outline"
        placeholder="Buscar insumo"
        value={search}
        onChangeText={setSearch}
      />
      <Text style={s.sectionTitle}>Insumos de la compra</Text>
      <Text style={s.meta}>
        Los artículos del ticket y los ya seleccionados aparecen primero.
      </Text>
      {purchasePages.visible.map((i) => (
        <Card key={i.id_insumo}>
          <Text style={s.cardTitle}>{i.nombre}</Text>
          <View style={s.twoColumns}>
            <Input
              style={{ flex: 1 }}
              placeholder="Cantidad"
              keyboardType="decimal-pad"
              value={quantities[i.id_insumo] || ""}
              onChangeText={(v) =>
                setQuantities((c) => ({
                  ...c,
                  [i.id_insumo]: v.replace(",", "."),
                }))
              }
            />
            <Input
              style={{ flex: 1 }}
              placeholder="Precio"
              keyboardType="decimal-pad"
              value={String(prices[i.id_insumo] ?? i.precio_referencia)}
              onChangeText={(v) =>
                setPrices((c) => ({ ...c, [i.id_insumo]: v.replace(",", ".") }))
              }
            />
          </View>
        </Card>
      ))}
      <Pagination {...purchasePages} onChange={purchasePages.setPage} />
      <DiscountField
        type={discountType}
        setType={setDiscountType}
        value={discountValue}
        setValue={setDiscountValue}
      />
      <PaymentField
        title="Método usado para pagar"
        value={paymentMethod}
        onChange={setPaymentMethod}
      />
      <View style={s.totalBar}>
        <View>
          <Text style={s.totalLabel}>Subtotal {money(subtotal)}</Text>
          {discount > 0 ? (
            <Text style={s.meta}>Descuento −{money(discount)}</Text>
          ) : null}
        </View>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
      <Button
        icon="checkmark"
        title={busy ? "Registrando…" : "Registrar compra"}
        disabled={busy}
        onPress={save}
      />
      <Modal
        visible={ticketOpen}
        animationType="slide"
        onRequestClose={() => setTicketOpen(false)}
      >
        <Screen>
          <ScrollView contentContainerStyle={s.page}>
            <Header
              title="Revisar ticket"
              subtitle={`Confianza aproximada: ${Math.round(Number(ticket?.confianza || 0) * 100)}%`}
              action={
                <IconButton icon="close" onPress={() => setTicketOpen(false)} />
              }
            />
            {ticketImage ? (
              <Image
                source={{ uri: ticketImage }}
                style={s.ticketPreview}
                resizeMode="contain"
              />
            ) : null}
            <Card>
              <Text style={s.cardTitle}>
                {ticket?.proveedor || "Proveedor no detectado"}
              </Text>
              <Text style={s.meta}>
                Fecha: {ticket?.fecha || "No detectada"} · Total leído:{" "}
                {money(ticket?.total)}
              </Text>
            </Card>
            {ticket?.advertencias?.map((warning, index) => (
              <View key={index} style={s.ticketWarning}>
                <Ionicons name="warning-outline" size={19} color="#A85D00" />
                <Text style={{ flex: 1, color: "#7A4808" }}>{warning}</Text>
              </View>
            ))}
            <Text style={s.sectionTitle}>Artículos detectados</Text>
            {ticketPages.visible.map((item, pageIndex) => {
              const index = (ticketPages.page - 1) * PAGE_SIZE + pageIndex;
              return (
                <Card key={`${index}-${item.nombre}`}>
                  <View style={s.spaceBetween}>
                    <Text style={s.cardTitle}>Artículo {index + 1}</Text>
                    <IconButton
                      danger
                      icon="trash-outline"
                      onPress={() => removeTicketItem(index)}
                    />
                  </View>
                  <Input
                    value={item.nombre_editado}
                    onChangeText={(value) => editTicketName(index, value)}
                  />
                  <Text style={s.meta}>
                    {item.cantidad} × {money(item.precio_unitario)} ={" "}
                    {money(item.subtotal)}
                  </Text>
                  <Text style={s.label}>Relacionar con un insumo</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.categoryStrip}
                  >
                    <Pressable
                      onPress={() => chooseSupply(index, null)}
                      style={[s.chip, !item.id_insumo && s.chipActive]}
                    >
                      <Text
                        style={!item.id_insumo ? s.chipTextActive : s.chipText}
                      >
                        Crear nuevo
                      </Text>
                    </Pressable>
                    {supplies.map((supply) => (
                      <Pressable
                        key={supply.id_insumo}
                        onPress={() => chooseSupply(index, supply.id_insumo)}
                        style={[
                          s.chip,
                          item.id_insumo === supply.id_insumo && s.chipActive,
                        ]}
                      >
                        <Text
                          style={
                            item.id_insumo === supply.id_insumo
                              ? s.chipTextActive
                              : s.chipText
                          }
                        >
                          {supply.nombre}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {!item.id_insumo ? (
                    <Text style={s.stockWarning}>
                      Se creará un insumo nuevo con el nombre revisado.
                    </Text>
                  ) : null}
                </Card>
              );
            })}
            <Pagination {...ticketPages} onChange={ticketPages.setPage} />
            <Button
              icon="checkmark"
              title={ticketBusy ? "Aplicando…" : "Aplicar al formulario"}
              disabled={ticketBusy || !ticket?.items?.length}
              onPress={applyTicket}
            />
            <Button
              secondary
              title="Cancelar"
              onPress={() => setTicketOpen(false)}
            />
          </ScrollView>
        </Screen>
      </Modal>
    </Form>
  );
}

export function Calculadora({ navigation }) {
  const [rows, setRows] = useState([]);
  const [used, setUsed] = useState({});
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api
      .get("/insumos", { params: { limit: 100 } })
      .then((response) => setRows(response.data.data));
  }, []);
  const baseFactor = (unit) => (unit === "kg" || unit === "l" ? 1000 : 1);
  const filtered = rows.filter((item) =>
    item.nombre.toLowerCase().includes(search.toLowerCase()),
  );
  const calculatorPages = usePagination(filtered, search);
  const cost = (item) =>
    (Number(item.precio_referencia) * Number(used[item.id_insumo] || 0)) /
    (Number(item.cantidad_referencia) * baseFactor(item.unidad_referencia));
  const total = rows.reduce((sum, item) => sum + cost(item), 0);
  const save = async () => {
    const details = rows
      .filter((item) => Number(used[item.id_insumo]) > 0)
      .map((item) => ({
        id_insumo: item.id_insumo,
        insumo_nombre: item.nombre,
        cantidad_usada: Number(used[item.id_insumo]),
        unidad_usada:
          item.tipo_medida === "peso"
            ? "g"
            : item.tipo_medida === "volumen"
              ? "ml"
              : "unidad",
        subtotal: Number(cost(item).toFixed(2)),
      }));
    try {
      setSaving(true);
      await api.post("/costos-productos", {
        nombre: name,
        costo_total: Number(total.toFixed(2)),
        detalles: details,
      });
      Alert.alert("Costo guardado", "Podés consultarlo en Costos guardados.", [
        { text: "Seguir calculando" },
        {
          text: "Ver costos",
          onPress: () => navigation.navigate("CostosProductos"),
        },
      ]);
      setName("");
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Form title="Calculadora de costos">
      <Button
        secondary
        icon="pricetags-outline"
        title="Ver costos guardados"
        onPress={() => navigation.navigate("CostosProductos")}
      />
      <Input
        icon="search-outline"
        placeholder="Buscar insumo"
        value={search}
        onChangeText={setSearch}
      />
      {calculatorPages.visible.map((item) => (
        <Card key={item.id_insumo}>
          <View style={s.spaceBetween}>
            <View>
              <Text style={s.cardTitle}>{item.nombre}</Text>
              <Text style={s.meta}>
                {money(item.precio_referencia)} / {item.cantidad_referencia}{" "}
                {item.unidad_referencia}
              </Text>
            </View>
            <Text style={s.amount}>{money(cost(item))}</Text>
          </View>
          <Input
            placeholder={`Cantidad usada (${item.tipo_medida === "peso" ? "g" : item.tipo_medida === "volumen" ? "ml" : "unidad"})`}
            keyboardType="decimal-pad"
            value={used[item.id_insumo] || ""}
            onChangeText={(value) =>
              setUsed((current) => ({
                ...current,
                [item.id_insumo]: value.replace(",", "."),
              }))
            }
          />
        </Card>
      ))}
      <Pagination {...calculatorPages} onChange={calculatorPages.setPage} />
      <View style={s.totalBar}>
        <Text style={s.totalLabel}>Costo total</Text>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
      <Card>
        <Text style={s.cardTitle}>Guardar este cálculo</Text>
        <Text style={s.meta}>Poné un nombre para encontrarlo después.</Text>
        <Input
          icon="fast-food-outline"
          placeholder="Ej. Torta de chocolate"
          value={name}
          onChangeText={setName}
        />
        <Button
          icon="save-outline"
          title={saving ? "Guardando…" : "Guardar costo"}
          disabled={saving || !name.trim()}
          onPress={save}
        />
      </Card>
    </Form>
  );
}

export function CostosProductos({ navigation }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    () =>
      api
        .get("/costos-productos", { params: { search } })
        .then((response) => setRows(response.data.data))
        .catch((error) => Alert.alert("Error", message(error))),
    [search],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const pages = usePagination(rows, search);
  const remove = (id) =>
    Alert.alert("Eliminar costo", "¿Querés quitar este cálculo guardado?", [
      { text: "Cancelar" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await api.patch(`/costos-productos/${id}/desactivar`);
          load();
        },
      },
    ]);
  const openEdit = (item) => {
    setEditing(item);
    setEditName(item.nombre);
    setEditTotal(String(item.costo_total));
  };
  const saveEdit = async () => {
    try {
      setSaving(true);
      await api.put(`/costos-productos/${editing.id_costo_producto}`, {
        nombre: editName,
        costo_total: Number(editTotal.replace(",", ".")),
        detalles: editing.detalle_json || [],
      });
      setEditing(null);
      load();
    } catch (error) {
      Alert.alert("No se pudo editar", message(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) => String(item.id_costo_producto)}
        ListHeaderComponent={
          <>
            <Header
              title="Costos guardados"
              subtitle="Historial de productos calculados"
              action={
                <IconButton
                  icon="add"
                  active
                  onPress={() => navigation.navigate("Calculadora")}
                />
              }
            />
            <Input
              icon="search-outline"
              placeholder="Buscar producto"
              value={search}
              onChangeText={setSearch}
            />
          </>
        }
        ListEmptyComponent={<Empty text="Todavía no guardaste costos" />}
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{item.nombre}</Text>
                <Text style={s.meta}>
                  {String(item.fecha_creacion).replace("T", " ").slice(0, 16)}
                </Text>
              </View>
              <Text style={s.totalValue}>{money(item.costo_total)}</Text>
            </View>
            {Array.isArray(item.detalle_json)
              ? item.detalle_json.map((detail, index) => (
                  <Text key={index} style={s.meta}>
                    {detail.insumo_nombre}: {detail.cantidad_usada}{" "}
                    {detail.unidad_usada} · {money(detail.subtotal)}
                  </Text>
                ))
              : null}
            <View style={s.actionRow}>
              <Button
                compact
                secondary
                icon="create-outline"
                title="Editar"
                style={{ flex: 1 }}
                onPress={() => openEdit(item)}
              />
              <IconButton
                danger
                icon="trash-outline"
                onPress={() => remove(item.id_costo_producto)}
              />
            </View>
          </Card>
        )}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
      <Modal
        visible={!!editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardDialog>
          <Header
            title="Editar costo"
            action={
              <IconButton icon="close" onPress={() => setEditing(null)} />
            }
          />
          <Input
            icon="fast-food-outline"
            placeholder="Nombre"
            value={editName}
            onChangeText={setEditName}
          />
          <Input
            icon="cash-outline"
            placeholder="Costo total"
            keyboardType="decimal-pad"
            value={editTotal}
            onChangeText={setEditTotal}
          />
          <Button
            icon="save-outline"
            title={saving ? "Guardando…" : "Guardar cambios"}
            disabled={
              saving ||
              !editName.trim() ||
              Number(editTotal.replace(",", ".")) < 0
            }
            onPress={saveEdit}
          />
        </KeyboardDialog>
      </Modal>
    </Screen>
  );
}

function PieChart({ values }) {
  const total = Math.max(
      1,
      values.reduce((s, i) => s + Number(i.value || 0), 0),
    ),
    radius = 52,
    circ = 2 * Math.PI * radius;
  let used = 0;
  return (
    <View style={s.chartWrap}>
      <Svg
        width={150}
        height={150}
        viewBox="0 0 150 150"
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        {values.map((item) => {
          const length = (Number(item.value || 0) / total) * circ,
            offset = -used;
          used += length;
          return (
            <Circle
              key={item.label}
              cx="75"
              cy="75"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="25"
              strokeDasharray={`${length} ${circ - length}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </Svg>
      <View style={{ flex: 1 }}>
        {values.map((item) => (
          <View key={item.label} style={s.legendRow}>
            <View style={[s.legendDot, { backgroundColor: item.color }]} />
            <Text style={s.meta}>
              {item.label}: {money(item.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function routeNavigationParts(route) {
  const points = [
    route.origen,
    ...(route.pedidos || []).map((order) => ({
      latitude: Number(order.latitud),
      longitude: Number(order.longitud),
    })),
  ];
  const parts = [];
  for (let index = 0; index < points.length - 1; index += 4)
    parts.push(points.slice(index, Math.min(index + 5, points.length)));
  return parts;
}

async function deliveryPosition() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Necesitamos permiso de ubicación para iniciar el reparto desde donde estás.",
    );
  let enabled = await Location.hasServicesEnabledAsync();
  if (!enabled && Platform.OS === "android") {
    try {
      await Location.enableNetworkProviderAsync();
      enabled = true;
    } catch {}
  }
  if (!enabled)
    throw new Error(
      "Activá la ubicación/GPS del teléfono y volvé a intentarlo.",
    );
  const last = await Location.getLastKnownPositionAsync({
    maxAge: 600000,
    requiredAccuracy: 2000,
  });
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("La ubicación tardó demasiado")),
          15000,
        ),
      ),
    ]);
  } catch (error) {
    if (last) return last;
    throw error;
  }
}

export function RutasReparto() {
  const [orders, setOrders] = useState([]),
    [categories, setCategories] = useState([]),
    [selected, setSelected] = useState([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("pendiente"),
    [paid, setPaid] = useState(""),
    [category, setCategory] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [loading, setLoading] = useState(false),
    [optimizing, setOptimizing] = useState(false),
    [route, setRoute] = useState(null);
  const mapRef = React.useRef(null);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/repartos/pedidos", {
        params: {
          buscar: search || undefined,
          estado: status || undefined,
          pagado: paid || undefined,
          categoria: category || undefined,
          desde: from || undefined,
          hasta: to || undefined,
        },
      });
      setOrders(response.data.data);
    } catch (error) {
      Alert.alert("No se pudieron cargar los pedidos", message(error));
    } finally {
      setLoading(false);
    }
  }, [search, status, paid, category, from, to]);
  useEffect(() => {
    api
      .get("/categorias-productos")
      .then((r) => setCategories(r.data.data))
      .catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (!route || !mapRef.current) return;
    const points = [
      route.origen,
      ...route.pedidos.map((i) => ({
        latitude: Number(i.latitud),
        longitude: Number(i.longitud),
      })),
    ];
    setTimeout(
      () =>
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 55, right: 45, bottom: 55, left: 45 },
          animated: true,
        }),
      250,
    );
  }, [route]);
  const pages = usePagination(
      orders,
      `${search}-${status}-${paid}-${category}-${from}-${to}`,
    ),
    toggle = (id) =>
      setSelected((current) =>
        current.includes(id)
          ? current.filter((value) => value !== id)
          : [...current, id],
      );
  const optimize = async () => {
    if (!selected.length)
      return Alert.alert(
        "Falta seleccionar",
        "Elegí al menos un pedido para crear la ruta.",
      );
    try {
      setOptimizing(true);
      const position = await deliveryPosition();
      const response = await api.post(
        "/repartos/optimizar",
        {
          pedidos: selected,
          origen: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        },
        { timeout: 120000 },
      );
      setRoute(response.data.data);
    } catch (error) {
      Alert.alert(
        "No se pudo crear la ruta",
        error.code === "ECONNABORTED"
          ? "La optimización tardó demasiado. Probá nuevamente o seleccioná menos pedidos."
          : message(error),
      );
    } finally {
      setOptimizing(false);
    }
  };
  const openPart = async (points) => {
    const format = (point) => `${point.latitude},${point.longitude}`,
      waypoints = points.slice(1, -1).map(format).join("|"),
      url = `https://www.google.com/maps/dir/?api=1&origin=${format(points[0])}&destination=${format(points.at(-1))}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving&dir_action=navigate`;
    await Linking.openURL(url);
  };
  const minutes = Math.round(Number(route?.duracion_segundos || 0) / 60),
    distance = (Number(route?.distancia_metros || 0) / 1000).toFixed(1),
    navigationParts = route ? routeNavigationParts(route) : [];
  const routeResultPages = usePagination(
    route?.pedidos || [],
    route?.pedidos?.map((item) => item.id_pedido).join("-") || "",
  );
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) => String(item.id_pedido)}
        ListHeaderComponent={
          <>
            <Header
              title="Rutas de reparto"
              subtitle="Elegí pedidos y optimizá el recorrido"
            />
            <Card>
              <Input
                icon="search-outline"
                placeholder="Cliente, dirección o producto"
                value={search}
                onChangeText={setSearch}
              />
              <View style={s.chips}>
                {[
                  ["", "Todos"],
                  ["pendiente", "Pendientes"],
                  ["entregado", "Entregados"],
                ].map(([value, label]) => (
                  <Pressable
                    key={label}
                    onPress={() => setStatus(value)}
                    style={[s.chip, status === value && s.chipActive]}
                  >
                    <Text
                      style={status === value ? s.chipTextActive : s.chipText}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.chips}>
                {[
                  ["", "Cualquier pago"],
                  ["false", "Sin pagar"],
                  ["true", "Pagados"],
                ].map(([value, label]) => (
                  <Pressable
                    key={label}
                    onPress={() => setPaid(value)}
                    style={[s.chip, paid === value && s.chipActive]}
                  >
                    <Text
                      style={paid === value ? s.chipTextActive : s.chipText}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.categoryStrip}
              >
                <Pressable
                  onPress={() => setCategory("")}
                  style={[s.chip, !category && s.chipActive]}
                >
                  <Text style={!category ? s.chipTextActive : s.chipText}>
                    Todas las categorías
                  </Text>
                </Pressable>
                {categories.map((item) => (
                  <Pressable
                    key={item.id_categoria}
                    onPress={() => setCategory(item.nombre)}
                    style={[s.chip, category === item.nombre && s.chipActive]}
                  >
                    <Text
                      style={
                        category === item.nombre ? s.chipTextActive : s.chipText
                      }
                    >
                      {item.nombre}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={s.meta}>Desde</Text>
              <DateField value={from} onChange={setFrom} />
              <Text style={s.meta}>Hasta</Text>
              <DateField value={to} onChange={setTo} />
              <Button
                compact
                secondary
                icon="refresh-outline"
                title="Aplicar filtros"
                onPress={load}
              />
            </Card>
            <View style={s.spaceBetween}>
              <Text style={s.sectionTitle}>
                {selected.length} seleccionados
              </Text>
              {orders.some((item) => item.tiene_ubicacion) ? (
                <Button
                  compact
                  secondary
                  title="Seleccionar todos"
                  onPress={() =>
                    setSelected((current) => [
                      ...new Set([
                        ...current,
                        ...orders
                          .filter((item) => item.tiene_ubicacion)
                          .map((item) => item.id_pedido),
                      ]),
                    ])
                  }
                />
              ) : null}
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : (
            <Empty text="No hay pedidos con estos filtros" />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={!item.tiene_ubicacion}
            onPress={() => toggle(item.id_pedido)}
          >
            <Card
              style={[
                s.routeOrder,
                selected.includes(item.id_pedido) && s.routeOrderSelected,
                !item.tiene_ubicacion && s.routeOrderDisabled,
              ]}
            >
              <View style={s.spaceBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{item.cliente_nombre}</Text>
                  <Text style={s.meta}>
                    {String(item.fecha_entrega).slice(0, 10)} ·{" "}
                    {item.direccion || "Sin dirección"}
                  </Text>
                  <Text style={s.meta}>{item.detalle}</Text>
                  {!item.tiene_ubicacion ? (
                    <Text style={s.stockWarning}>
                      Falta elegir su ubicación en Clientes
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={
                    selected.includes(item.id_pedido)
                      ? "checkmark-circle"
                      : "ellipse-outline"
                  }
                  size={27}
                  color={
                    item.tiene_ubicacion ? colors.primary : colors.disabled
                  }
                />
              </View>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <>
            <Pagination {...pages} onChange={pages.setPage} />
            <Button
              icon="navigate-outline"
              title={
                optimizing
                  ? "Calculando mejor recorrido…"
                  : `Optimizar ${selected.length || ""} pedidos`
              }
              disabled={optimizing || !selected.length}
              onPress={optimize}
            />
            {route ? (
              <>
                <Card style={s.routeSummary}>
                  <Text style={s.routeSummaryTitle}>Ruta lista</Text>
                  <Text style={s.routeSummaryValue}>
                    {distance} km · aprox. {minutes} min
                  </Text>
                  <Text style={s.meta}>
                    {route.pedidos.length} entregas, desde tu ubicación actual
                  </Text>
                </Card>
                <MapView
                  ref={mapRef}
                  style={s.routeMap}
                  initialRegion={{
                    latitude: route.origen.latitude,
                    longitude: route.origen.longitude,
                    latitudeDelta: 0.08,
                    longitudeDelta: 0.08,
                  }}
                >
                  <Marker
                    coordinate={route.origen}
                    title="Punto de partida"
                    pinColor="#222"
                  />
                  {route.pedidos.map((item, index) => (
                    <Marker
                      key={item.id_pedido}
                      coordinate={{
                        latitude: Number(item.latitud),
                        longitude: Number(item.longitud),
                      }}
                      title={`${index + 1}. ${item.cliente_nombre}`}
                      description={item.direccion}
                    />
                  ))}
                  <Polyline
                    coordinates={route.coordenadas || []}
                    strokeColor={colors.primaryDark}
                    strokeWidth={5}
                  />
                </MapView>
                <Text style={s.sectionTitle}>Orden de entrega</Text>
                <Text style={s.meta}>
                  Google Maps abrirá estas paradas en el mismo orden: primero la
                  1, luego la 2 y así sucesivamente.
                </Text>
                {routeResultPages.visible.map((item, pageIndex) => {
                  const index =
                    (routeResultPages.page - 1) * PAGE_SIZE + pageIndex;
                  return (
                    <Card key={item.id_pedido}>
                      <View style={s.routeStep}>
                        <View style={s.routeNumber}>
                          <Text style={s.routeNumberText}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardTitle}>{item.cliente_nombre}</Text>
                          <Text style={s.meta}>{item.direccion}</Text>
                        </View>
                      </View>
                    </Card>
                  );
                })}
                <Pagination
                  {...routeResultPages}
                  onChange={routeResultPages.setPage}
                />
                {navigationParts.map((part, index) => (
                  <Button
                    key={index}
                    secondary={index > 0}
                    icon="navigate"
                    title={
                      navigationParts.length === 1
                        ? `Navegar las ${route.pedidos.length} paradas en Google Maps`
                        : `Navegar paradas ${index * 4 + 1} a ${Math.min((index + 1) * 4, route.pedidos.length)}`
                    }
                    onPress={() => openPart(part)}
                  />
                ))}
              </>
            ) : null}
          </>
        }
      />
    </Screen>
  );
}

export function Informes() {
  const [data, setData] = useState(null),
    [mode, setMode] = useState("pedidos"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/informes", {
        params: {
          buscar: search,
          desde: from,
          hasta: to,
          estado: status || undefined,
        },
      })
      .then((r) => setData(r.data.data))
      .catch((error) => Alert.alert("No se pudo cargar", message(error)))
      .finally(() => setLoading(false));
  }, [search, from, to, status]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const rows = mode === "pedidos" ? data?.pedidos || [] : data?.compras || [],
    pages = usePagination(rows, `${mode}-${search}-${from}-${to}-${status}`);
  const exportExcel = async () => {
    try {
      const isOrders = mode === "pedidos";
      const headers = isOrders
        ? [
            "Pedido",
            "Fecha entrega",
            "Cliente",
            "Estado",
            "Pagado",
            "Método de pago",
            "Producto",
            "Cantidad",
            "Precio unitario",
            "Subtotal ítem",
            "Subtotal pedido",
            "Descuento",
            "Total pedido",
          ]
        : [
            "Compra",
            "Fecha compra",
            "Proveedor",
            "Método de pago",
            "Insumo",
            "Cantidad",
            "Precio unitario",
            "Subtotal ítem",
            "Subtotal compra",
            "Descuento",
            "Total compra",
          ];
      const detailRows = rows.flatMap((operation) => {
        const items = operation.items?.length ? operation.items : [{}];
        return items.map((item) =>
          isOrders
            ? [
                operation.id_pedido,
                String(operation.fecha_entrega).slice(0, 10),
                operation.cliente_nombre,
                operation.estado,
                operation.pagado ? "Sí" : "No",
                operation.metodo_pago || "efectivo",
                item.producto_nombre || "Sin detalle",
                Number(item.cantidad || 0),
                Number(item.precio_unitario || 0),
                Number(item.subtotal || 0),
                Number(operation.subtotal || 0),
                Number(operation.descuento_importe || 0),
                Number(operation.total || 0),
              ]
            : [
                operation.id_compra,
                String(operation.fecha_compra).slice(0, 10),
                operation.proveedor,
                operation.metodo_pago || "efectivo",
                item.insumo_nombre || "Sin detalle",
                Number(item.cantidad || 0),
                Number(item.precio_unitario || 0),
                Number(item.subtotal || 0),
                Number(operation.subtotal || 0),
                Number(operation.descuento_importe || 0),
                Number(operation.total || 0),
              ],
        );
      });
      const filterDescription = `Desde: ${from || "sin límite"} | Hasta: ${to || "sin límite"} | Búsqueda: ${search || "todas"}${isOrders ? ` | Estado: ${status || "todos"}` : ""}`;
      const reportTotal = rows.reduce(
        (sum, operation) => sum + Number(operation.total || 0),
        0,
      );
      const totalRow = [
        `TOTAL ${isOrders ? "PEDIDOS" : "COMPRAS"} (${rows.length} operaciones)`,
        ...Array(headers.length - 2).fill(""),
        reportTotal,
      ];
      const sheetData = [
        [
          `Ciento Once · Informe detallado de ${isOrders ? "pedidos" : "compras"}`,
        ],
        [filterDescription],
        [],
        headers,
        ...detailRows,
        totalRow,
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData),
        wb = XLSX.utils.book_new();
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        {
          s: { r: sheetData.length - 1, c: 0 },
          e: { r: sheetData.length - 1, c: headers.length - 2 },
        },
      ];
      ws["!cols"] = headers.map((header, index) => ({
        wch:
          index === 6 || (!isOrders && index === 4)
            ? 28
            : Math.max(13, header.length + 2),
      }));
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: 3, c: 0 },
          e: { r: Math.max(3, 3 + detailRows.length), c: headers.length - 1 },
        }),
      };
      ws.A1.s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 },
        fill: { fgColor: { rgb: "287A50" } },
        alignment: { horizontal: "center" },
      };
      ws.A2.s = {
        font: { italic: true, color: { rgb: "22332A" } },
        fill: { fgColor: { rgb: "E7F4EC" } },
        alignment: { horizontal: "center" },
      };
      headers.forEach((_, column) => {
        ws[XLSX.utils.encode_cell({ r: 3, c: column })].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "3CB371" } },
          alignment: { horizontal: "center", wrapText: true },
          border: { bottom: { style: "thin", color: { rgb: "287A50" } } },
        };
      });
      for (let row = 4; row < sheetData.length; row++)
        for (let column = 0; column < headers.length; column++) {
          const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })];
          if (!cell) continue;
          cell.s = {
            fill: { fgColor: { rgb: row % 2 ? "F5FBF7" : "FFFFFF" } },
            border: { bottom: { style: "hair", color: { rgb: "D7E5DB" } } },
          };
          if ((isOrders && column >= 8) || (!isOrders && column >= 6))
            cell.z = "$#,##0.00";
        }
      const totalIndex = sheetData.length - 1;
      const totalLabelCell =
        ws[XLSX.utils.encode_cell({ r: totalIndex, c: 0 })];
      const totalValueCell =
        ws[XLSX.utils.encode_cell({ r: totalIndex, c: headers.length - 1 })];
      const totalStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill: { fgColor: { rgb: "287A50" } },
        alignment: { horizontal: "right" },
        border: { top: { style: "medium", color: { rgb: "1D5F3D" } } },
      };
      totalLabelCell.s = totalStyle;
      totalValueCell.s = totalStyle;
      totalValueCell.z = "$#,##0.00";
      XLSX.utils.book_append_sheet(wb, ws, isOrders ? "Pedidos" : "Compras");
      const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
        uri = `${FileSystem.cacheDirectory}informe-${mode}-ciento-once-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(uri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: "Compartir informe de Ciento Once",
      });
    } catch (error) {
      Alert.alert("No se pudo exportar", String(error.message || error));
    }
  };
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(i) =>
          String(mode === "pedidos" ? i.id_pedido : i.id_compra)
        }
        ListHeaderComponent={
          <>
            <Header
              title="Informes"
              subtitle="Ventas, compras y rendimiento"
              action={
                <IconButton
                  icon="download-outline"
                  active
                  onPress={exportExcel}
                />
              }
            />
            <Card>
              <Text style={s.cardTitle}>Filtros personalizables</Text>
              <Input
                icon="search-outline"
                placeholder="Cliente, proveedor, producto o insumo"
                value={search}
                onChangeText={setSearch}
              />
              <Text style={s.meta}>Desde</Text>
              <DateField value={from} onChange={setFrom} />
              <Text style={s.meta}>Hasta</Text>
              <DateField value={to} onChange={setTo} />
              {mode === "pedidos" ? (
                <View style={s.chips}>
                  {[
                    ["", "Todos"],
                    ["pendiente", "Pendientes"],
                    ["entregado", "Entregados"],
                  ].map(([v, l]) => (
                    <Pressable
                      key={l}
                      onPress={() => setStatus(v)}
                      style={[s.chip, status === v && s.chipActive]}
                    >
                      <Text
                        style={status === v ? s.chipTextActive : s.chipText}
                      >
                        {l}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Button
                compact
                secondary
                icon="refresh"
                title="Aplicar filtros"
                onPress={load}
              />
              <Button
                compact
                icon="download-outline"
                title="Exportar a Excel"
                onPress={exportExcel}
              />
            </Card>
            <View style={s.segment}>
              <Pressable
                onPress={() => setMode("pedidos")}
                style={[s.segmentButton, mode === "pedidos" && s.segmentActive]}
              >
                <Text
                  style={
                    mode === "pedidos" ? s.segmentTextActive : s.segmentText
                  }
                >
                  Pedidos
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("compras")}
                style={[s.segmentButton, mode === "compras" && s.segmentActive]}
              >
                <Text
                  style={
                    mode === "compras" ? s.segmentTextActive : s.segmentText
                  }
                >
                  Compras
                </Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : (
            <Empty text="No hay datos con estos filtros" />
          )
        }
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <Text style={s.cardTitle}>
                {mode === "pedidos" ? item.cliente_nombre : item.proveedor}
              </Text>
              <Text style={s.amount}>{money(item.total)}</Text>
            </View>
            <Text style={s.meta}>
              {String(
                mode === "pedidos" ? item.fecha_entrega : item.fecha_compra,
              ).slice(0, 10)}{" "}
              · {mode === "pedidos" ? item.estado : "Compra"}
            </Text>
            <Text style={s.meta}>{item.detalle || "Sin detalle"}</Text>
            {Number(item.descuento_importe) > 0 ? (
              <Text style={s.income}>
                Descuento: {money(item.descuento_importe)}
              </Text>
            ) : null}
          </Card>
        )}
        ListFooterComponent={
          <>
            <Pagination {...pages} onChange={pages.setPage} />
            <Text style={s.sectionTitle}>Más vendidos</Text>
            {(data?.top_productos || []).map((i, n) => (
              <Card key={i.nombre}>
                <Text style={s.cardTitle}>
                  {n + 1}. {i.nombre}
                </Text>
                <Text style={s.meta}>
                  {i.cantidad} unidades · {money(i.importe)}
                </Text>
              </Card>
            ))}
            <Text style={s.sectionTitle}>Insumos más comprados</Text>
            {(data?.top_insumos || []).map((i, n) => (
              <Card key={i.nombre}>
                <Text style={s.cardTitle}>
                  {n + 1}. {i.nombre}
                </Text>
                <Text style={s.meta}>
                  {i.cantidad} · {money(i.importe)}
                </Text>
              </Card>
            ))}
            <Text style={s.sectionTitle}>Distribución general</Text>
            <Card>
              <PieChart
                values={[
                  {
                    label: "Ventas entregadas",
                    value: data?.resumen?.ventas,
                    color: colors.primary,
                  },
                  {
                    label: "Compras",
                    value: data?.resumen?.compras,
                    color: "#E7A84D",
                  },
                  {
                    label: "Capital neto",
                    value: Math.abs(data?.resumen?.capital || 0),
                    color: "#4B75C9",
                  },
                ]}
              />
            </Card>
          </>
        }
      />
    </Screen>
  );
}

export function HistorialCliente({ route }) {
  const [data, setData] = useState(null);
  useFocusEffect(
    useCallback(() => {
      api
        .get(`/clientes/${route.params.idCliente}/historial`)
        .then((response) => setData(response.data.data))
        .catch((error) => Alert.alert("No se pudo cargar", message(error)));
    }, [route.params.idCliente]),
  );
  const pages = usePagination(data?.pedidos || [], data?.pedidos?.length || 0);
  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
        data={pages.visible}
        keyExtractor={(item) => String(item.id_pedido)}
        ListHeaderComponent={
          <>
            <Header
              title={data?.cliente?.nombre || "Historial del cliente"}
              subtitle="Actividad, pagos y deuda"
            />
            <View style={s.metricGrid}>
              <DashboardMetric
                icon="receipt-outline"
                label="Pedidos"
                value={data?.resumen?.cantidad || 0}
              />
              <DashboardMetric
                icon="alert-circle-outline"
                label="Saldo pendiente"
                value={money(data?.resumen?.deuda)}
                tone={Number(data?.resumen?.deuda) > 0 ? "amber" : "green"}
              />
            </View>
            <Card>
              <View style={s.spaceBetween}>
                <Text style={s.cardTitle}>Compras acumuladas</Text>
                <Text style={s.totalValue}>{money(data?.resumen?.total)}</Text>
              </View>
              <Text style={s.meta}>
                Última operación:{" "}
                {data?.resumen?.ultima_compra
                  ? String(data.resumen.ultima_compra).slice(0, 10)
                  : "Sin compras"}
              </Text>
            </Card>
            <Text style={s.sectionTitle}>Pedidos</Text>
          </>
        }
        ListEmptyComponent={
          !data ? (
            <Loading />
          ) : (
            <Empty text="Este cliente todavía no tiene pedidos" />
          )
        }
        renderItem={({ item }) => (
          <Card>
            <View style={s.spaceBetween}>
              <Text style={s.cardTitle}>Pedido #{item.id_pedido}</Text>
              <Text style={s.amount}>{money(item.total)}</Text>
            </View>
            <Text style={s.meta}>
              {String(item.fecha_entrega).slice(0, 10)} · {item.estado}
            </Text>
            <StatusPill
              active={!!item.pagado}
              text={
                item.pagado ? `Pagado · ${item.metodo_pago}` : "Pago pendiente"
              }
            />
          </Card>
        )}
        ListFooterComponent={<Pagination {...pages} onChange={pages.setPage} />}
      />
    </Screen>
  );
}

export function CentroComercial() {
  const [config, setConfig] = useState({}),
    [employees, setEmployees] = useState([]),
    [employeeOpen, setEmployeeOpen] = useState(false),
    [employee, setEmployee] = useState({ nombre: "", rol: "ventas", pin: "" }),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([api.get("/configuracion-comercial"), api.get("/empleados")])
        .then(([a, b]) => {
          setConfig(a.data.data || {});
          setEmployees(b.data.data || []);
        })
        .catch((error) => Alert.alert("No se pudo cargar", message(error))),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const employeePages = usePagination(employees, employees.length);
  const change = (key, value) =>
    setConfig((current) => ({ ...current, [key]: value }));
  const saveConfig = async () => {
    try {
      setBusy(true);
      await api.put("/configuracion-comercial", config);
      Alert.alert("Configuración guardada");
    } catch (error) {
      Alert.alert("No se pudo guardar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const backup = async () => {
    try {
      setBusy(true);
      const response = await api.get("/backup"),
        uri = `${FileSystem.cacheDirectory}respaldo-ciento-once-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(
        uri,
        JSON.stringify(response.data.data, null, 2),
      );
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Guardar respaldo",
      });
    } catch (error) {
      Alert.alert("No se pudo respaldar", message(error));
    } finally {
      setBusy(false);
    }
  };
  const createEmployee = async () => {
    try {
      setBusy(true);
      await api.post("/empleados", employee);
      setEmployeeOpen(false);
      setEmployee({ nombre: "", rol: "ventas", pin: "" });
      load();
    } catch (error) {
      Alert.alert("No se pudo crear", message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Form title="Centro comercial">
      <Card>
        <Text style={s.cardTitle}>Identidad del negocio</Text>
        <Input
          icon="storefront-outline"
          placeholder="Nombre del negocio"
          value={config.nombre_negocio || ""}
          onChangeText={(value) => change("nombre_negocio", value)}
        />
        <Input
          icon="call-outline"
          placeholder="Teléfono"
          value={config.telefono || ""}
          onChangeText={(value) => change("telefono", value)}
        />
        <Input
          icon="location-outline"
          placeholder="Dirección"
          value={config.direccion || ""}
          onChangeText={(value) => change("direccion", value)}
        />
        <Input
          icon="document-outline"
          placeholder="CUIT"
          keyboardType="number-pad"
          value={config.cuit || ""}
          onChangeText={(value) => change("cuit", value)}
        />
        <Button
          title={busy ? "Guardando…" : "Guardar datos"}
          disabled={busy}
          onPress={saveConfig}
        />
      </Card>
      <Card>
        <View style={s.spaceBetween}>
          <View>
            <Text style={s.cardTitle}>Equipo y permisos</Text>
            <Text style={s.meta}>Perfiles preparados por función.</Text>
          </View>
          <IconButton
            icon="person-add-outline"
            active
            onPress={() => setEmployeeOpen(true)}
          />
        </View>
        {employeePages.visible.map((item) => (
          <View key={item.id_empleado} style={s.alertRow}>
            <View>
              <Text style={s.cardTitle}>{item.nombre}</Text>
              <Text style={s.meta}>{item.rol}</Text>
            </View>
            <IconButton
              danger
              icon="trash-outline"
              onPress={() =>
                Alert.alert("Desactivar empleado", "¿Continuar?", [
                  { text: "Cancelar" },
                  {
                    text: "Desactivar",
                    onPress: async () => {
                      await api.patch(
                        `/empleados/${item.id_empleado}/desactivar`,
                      );
                      load();
                    },
                  },
                ])
              }
            />
          </View>
        ))}
        <Pagination {...employeePages} onChange={employeePages.setPage} />
      </Card>
      <Card>
        <Text style={s.cardTitle}>Respaldo de datos</Text>
        <Text style={s.meta}>
          Exporta la información completa de esta cuenta en formato JSON.
        </Text>
        <Button
          secondary
          icon="cloud-download-outline"
          title="Crear respaldo ahora"
          disabled={busy}
          onPress={backup}
        />
      </Card>
      <Modal
        visible={employeeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmployeeOpen(false)}
      >
        <KeyboardDialog>
          <Header
            title="Nuevo empleado"
            action={
              <IconButton icon="close" onPress={() => setEmployeeOpen(false)} />
            }
          />
          <Input
            icon="person-outline"
            placeholder="Nombre"
            value={employee.nombre}
            onChangeText={(value) =>
              setEmployee((current) => ({ ...current, nombre: value }))
            }
          />
          <Text style={s.label}>Rol</Text>
          <View style={s.chips}>
            {["administrador", "caja", "ventas", "reparto"].map((role) => (
              <Pressable
                key={role}
                onPress={() =>
                  setEmployee((current) => ({ ...current, rol: role }))
                }
                style={[s.chip, employee.rol === role && s.chipActive]}
              >
                <Text
                  style={employee.rol === role ? s.chipTextActive : s.chipText}
                >
                  {role}
                </Text>
              </Pressable>
            ))}
          </View>
          <Input
            icon="lock-closed-outline"
            placeholder="PIN (mínimo 4 dígitos)"
            keyboardType="number-pad"
            secureTextEntry
            value={employee.pin}
            onChangeText={(value) =>
              setEmployee((current) => ({ ...current, pin: value }))
            }
          />
          <Button
            title={busy ? "Guardando…" : "Crear empleado"}
            disabled={busy}
            onPress={createEmployee}
          />
        </KeyboardDialog>
      </Modal>
    </Form>
  );
}

export function Ayuda() {
  const sections = [
    {
      title: "Clientes y ventas",
      image: require("../../assets/ayuda-pedidos.png"),
      items: [
        "Cargá o creá rápidamente un cliente desde el pedido.",
        "Elegí productos, fecha, descuento, pago y entrega.",
        "Crear un pedido reserva stock; cancelarlo lo devuelve. Pagado registra el ingreso en Caja.",
      ],
    },
    {
      title: "Productos, insumos y stock",
      image: require("../../assets/ayuda-stock.png"),
      items: [
        "Creá categorías propias y registrá productos e insumos.",
        "Nueva compra conserva proveedor, fecha y descuento.",
        "El stock puede quedar negativo; la app te advierte antes de confirmar.",
      ],
    },
    {
      title: "Costos, caja e informes",
      image: require("../../assets/ayuda-informes.png"),
      items: [
        "Calculá y guardá costos de elaboración.",
        "Registrá aportes y retiros sin mezclarlos con ventas.",
        "Filtrá informes, consultá rankings y exportá el resultado a Excel.",
      ],
    },
  ];
  return (
    <Screen>
      <ScrollView contentContainerStyle={s.page}>
        <Header
          title="Cómo usar la app"
          subtitle="Guía completa para gestionar tu comercio"
        />
        {sections.map((section) => (
          <View key={section.title}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Image
              source={section.image}
              style={s.helpLandscape}
              resizeMode="contain"
            />
            <Card>
              {section.items.map((item, index) => (
                <View key={item} style={s.helpBullet}>
                  <View style={s.helpNumber}>
                    <Text style={s.helpNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={[s.meta, { flex: 1 }]}>{item}</Text>
                </View>
              ))}
            </Card>
          </View>
        ))}
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Text style={s.cardTitle}>Buenas prácticas</Text>
          <Text style={s.meta}>
            Registrá operaciones en su fecha real, revisá faltantes antes de
            entregar y exportá informes periódicamente como respaldo
            administrativo.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

export const s = StyleSheet.create({
  page: { padding: 18, paddingBottom: 42 },
  form: { padding: 20, paddingBottom: 70 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: { color: colors.textSecondary, marginTop: 3, fontSize: 14 },
  welcome: {
    color: colors.textSecondary,
    fontSize: 17,
    marginTop: -12,
    marginBottom: 26,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 12,
    color: colors.text,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  meta: { color: colors.textSecondary, lineHeight: 21, marginTop: 3 },
  amount: { color: colors.primaryDark, fontWeight: "800", fontSize: 16 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 7,
  },
  search: { flex: 1, marginBottom: 0 },
  spaceBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 12,
  },
  dashboardHero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#185C37",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  dashboardEyebrow: {
    color: "#DDF5E7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  dashboardHeroValue: {
    color: "#FFF",
    fontSize: 29,
    fontWeight: "900",
    marginTop: 5,
  },
  dashboardHeroText: { color: "#E7F6ED", fontSize: 13, marginTop: 3 },
  dashboardHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  metricGrid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  metricCard: {
    flex: 1,
    minHeight: 143,
    backgroundColor: "#FFF",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  metricCardAmber: { backgroundColor: "#FFF9EC", borderColor: "#F0D9A9" },
  metricCardDark: { backgroundColor: "#21362A", borderColor: "#21362A" },
  metricIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  metricIconAmber: { backgroundColor: "#FCEAC1" },
  metricIconDark: { backgroundColor: "rgba(255,255,255,.13)" },
  metricValue: { color: colors.text, fontSize: 19, fontWeight: "900" },
  metricLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  metricDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  alertPanel: {
    backgroundColor: "#FFF9EC",
    borderColor: "#F0D39A",
    padding: 14,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  alertIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: "#FBE8BB",
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: { color: "#6F4700", fontSize: 16, fontWeight: "800" },
  alertRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1DDB6",
  },
  alertRowText: { color: "#714A08", fontWeight: "600", flex: 1 },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 4,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 12,
  },
  sectionLink: {
    color: colors.primaryDark,
    fontWeight: "800",
    marginBottom: 12,
  },
  quickGrid: { flexDirection: "row", gap: 12 },
  quickCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  quickTitle: { fontWeight: "800", fontSize: 16 },
  quickText: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.28)",
    alignItems: "flex-end",
  },
  drawer: {
    width: "82%",
    height: "100%",
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 70,
  },
  drawerTitle: { fontSize: 26, fontWeight: "800", marginBottom: 24 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuText: { flex: 1, fontSize: 16, fontWeight: "650" },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    padding: 11,
    borderRadius: 11,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.primaryDark, fontWeight: "700" },
  segmentTextActive: { color: "#FFF" },
  label: {
    fontWeight: "800",
    fontSize: 16,
    color: colors.text,
    marginTop: 13,
    marginBottom: 10,
  },
  chips: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  filterRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 13,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: {
    color: colors.primaryDark,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#FFF",
    fontWeight: "700",
    textTransform: "capitalize",
  },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#EFEFEF",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 9,
  },
  pillActive: { backgroundColor: colors.primarySoft },
  pillText: {
    color: colors.textSecondary,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  pillTextActive: { color: colors.primaryDark },
  deliveryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
  },
  deliveryActive: { backgroundColor: colors.primary },
  deliveryText: { color: colors.textSecondary, fontWeight: "700" },
  switchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
  },
  stockBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 8,
    alignItems: "center",
  },
  stockNumber: { fontSize: 22, fontWeight: "800", color: colors.primaryDark },
  stockLabel: { fontSize: 10, color: colors.textSecondary },
  modalCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.3)",
    justifyContent: "center",
    padding: 20,
  },
  modalKeyboardContent: { flexGrow: 1, justifyContent: "center", padding: 18 },
  dialog: { backgroundColor: colors.background, borderRadius: 22, padding: 20 },
  balanceCard: {
    backgroundColor: "#111",
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
  },
  balanceLabel: { color: "#BBB", fontSize: 14 },
  balanceValue: {
    color: "#FFF",
    fontSize: 32,
    fontWeight: "800",
    marginVertical: 7,
  },
  balanceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 15,
    marginTop: 8,
  },
  balanceSmall: { color: "#AAA", fontSize: 12 },
  income: { color: colors.primary, fontWeight: "800" },
  expense: { color: "#E46B62", fontWeight: "800" },
  movementAmount: { fontSize: 15, fontWeight: "800" },
  selectRow: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  selectRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  selectText: { fontWeight: "650" },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  counter: { flexDirection: "row", alignItems: "center", gap: 10 },
  counterText: {
    width: 24,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 17,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  totalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    padding: 17,
    borderRadius: 15,
    marginVertical: 14,
  },
  totalLabel: { fontWeight: "700", color: colors.primaryDark },
  totalValue: { fontSize: 21, fontWeight: "800", color: colors.primaryDark },
  twoColumns: { flexDirection: "row", gap: 8, marginTop: 11 },
  helpImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 22,
    marginBottom: 18,
    backgroundColor: colors.primarySoft,
  },
  helpLandscape: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 18,
    marginBottom: 12,
    backgroundColor: colors.primarySoft,
  },
  helpStep: { flexDirection: "row", gap: 13, alignItems: "center" },
  helpBullet: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  helpNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  helpNumberText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  dateRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  discountToggle: {
    width: 58,
    minHeight: 49,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  discountToggleText: { color: "#FFF", fontSize: 21, fontWeight: "800" },
  categoryStrip: { gap: 8, paddingBottom: 10 },
  stockWarning: { color: "#C65B3C", fontWeight: "700" },
  geoReady: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 7,
  },
  reportFab: {
    position: "absolute",
    right: 18,
    bottom: 82,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: 17,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    elevation: 5,
  },
  reportFabText: { color: "#FFF", fontWeight: "800" },
  chartWrap: { flexDirection: "row", alignItems: "center", gap: 14 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  routeOrder: { padding: 14 },
  routeOrderSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primarySoft,
  },
  routeOrderDisabled: { opacity: 0.55 },
  routeMap: { height: 360, borderRadius: 20, marginVertical: 15 },
  routeSummary: { backgroundColor: "#111", marginTop: 16 },
  routeSummaryTitle: { color: "#C7EFD7", fontWeight: "800", fontSize: 16 },
  routeSummaryValue: {
    color: "#FFF",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 6,
  },
  routeStep: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeNumber: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  routeNumberText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  ticketCard: { backgroundColor: "#F0FAF4", borderColor: "#B9E4CA" },
  ticketIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  ticketIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketPreview: {
    width: "100%",
    height: 260,
    backgroundColor: "#EFEFEF",
    borderRadius: 18,
    marginBottom: 14,
  },
  ticketWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF1D9",
    marginBottom: 8,
  },
});
