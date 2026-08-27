import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { Loading } from "../components/UI";
import {
  Login,
  Registro,
  Home,
  CrudList,
  Pedidos,
  Stock,
  Caja,
  NuevoPedido,
  NuevaCompra,
  Calculadora,
  CostosProductos,
  CategoriasProductos,
  Informes,
  Ayuda,
  RutasReparto,
  HistorialCliente,
  CentroComercial,
} from "../screens/Screens";
import colors from "../theme/colors";

const Stack = createNativeStackNavigator(),
  Tab = createBottomTabNavigator();
function Main() {
  const { session } = useAuth();
  const role = session?.usuario?.rol || "propietario",
    manager = ["propietario", "administrador"].includes(role);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={
              {
                Inicio: "home",
                Productos: "fast-food",
                Pedidos: "receipt",
                Stock: "cube",
                Caja: "cash",
              }[route.name]
            }
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen name="Inicio" component={Home} />
      {manager || role === "ventas" ? (
        <Tab.Screen name="Productos" component={CrudList} />
      ) : null}
      {manager || ["ventas", "reparto", "caja"].includes(role) ? (
        <Tab.Screen name="Pedidos" component={Pedidos} />
      ) : null}
      {manager ? <Tab.Screen name="Stock" component={Stock} /> : null}
      {manager || role === "caja" ? (
        <Tab.Screen name="Caja" component={Caja} />
      ) : null}
    </Tab.Navigator>
  );
}
export default function Root() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <Stack.Navigator>
      {!session ? (
        <>
          <Stack.Screen
            name="Login"
            component={Login}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Registro"
            component={Registro}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Principal"
            component={Main}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="Clientes" component={CrudList} />
          <Stack.Screen name="Insumos" component={CrudList} />
          <Stack.Screen
            name="NuevoPedido"
            component={NuevoPedido}
            options={{ title: "Nuevo pedido" }}
          />
          <Stack.Screen
            name="NuevaCompra"
            component={NuevaCompra}
            options={{ title: "Nueva compra" }}
          />
          <Stack.Screen name="Calculadora" component={Calculadora} />
          <Stack.Screen
            name="CostosProductos"
            component={CostosProductos}
            options={{ title: "Costos guardados" }}
          />
          <Stack.Screen
            name="CategoriasProductos"
            component={CategoriasProductos}
            options={{ title: "Categorías" }}
          />
          <Stack.Screen
            name="Informes"
            component={Informes}
            options={{ title: "Informes" }}
          />
          <Stack.Screen
            name="RutasReparto"
            component={RutasReparto}
            options={{ title: "Rutas de reparto" }}
          />
          <Stack.Screen
            name="HistorialCliente"
            component={HistorialCliente}
            options={{ title: "Historial del cliente" }}
          />
          <Stack.Screen
            name="CentroComercial"
            component={CentroComercial}
            options={{ title: "Centro comercial" }}
          />
          <Stack.Screen name="Ayuda" component={Ayuda} />
        </>
      )}
    </Stack.Navigator>
  );
}
