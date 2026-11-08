const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { create, act } = require("react-test-renderer");
const babel = require("@babel/core");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("Sara: marcar 15 días entre páginas no llama API; aplicar envía un lote y conserva orden", async () => {
  const alerts = [];
  const calls = [];
  const edits = [];
  let fail = false;
  let role = "propietario";
  let guard;
  let getCount = 0;
  const deliveries = Array.from({ length: 15 }, (_, i) => ({
    id_pedido_vianda: i + 1,
    fecha_entrega: `2026-11-${String(9 + i).padStart(2, "0")}`,
    hora_entrega: "12:00:00",
    estado: "pendiente",
    pagado: 0,
    total: 100,
    metodo_pago: "efectivo",
    id_cliente: 1,
    id_tipo_vianda: 1,
    cantidad: 1,
    precio_unitario: 100,
  }));
  const data = {
    cliente: { nombre: "Sara" },
    series: [
      {
        id_serie: "plan-sara",
        total_plan: 1500,
        monto_pagado: 0,
        pagado: 0,
        frecuencia: "mensual",
        cantidad_entregas: 15,
        fecha_inicio: "2026-11-09",
        fecha_fin: "2026-11-23",
        entregas: deliveries,
      },
    ],
  };
  const native = Object.fromEntries(
    [
      "Modal",
      "Pressable",
      "RefreshControl",
      "ScrollView",
      "Switch",
      "Text",
      "View",
    ].map((k) => [k, k]),
  );
  Object.assign(native, {
    Alert: { alert: (...args) => alerts.push(args) },
    Platform: { OS: "android" },
    StyleSheet: { create: (x) => x },
  });
  const ui = Object.fromEntries(
    [
      "Button",
      "Card",
      "Empty",
      "IconButton",
      "Input",
      "Loading",
      "Pagination",
    ].map((k) => [k, (props) => React.createElement(k, props, props.children)]),
  );
  ui.money = (n) => `$${n}`;
  const api = {
    get: async (url) => {
      if (url === "/viandas/configuracion")
        return {
          data: {
            data: {
              tipos: [
                { id_tipo_vianda: 1, nombre: "Vianda", precio_base: 999 },
              ],
            },
          },
        };
      if (url === "/clientes")
        return { data: { data: [{ id_cliente: 1, nombre: "Sara" }] } };
      getCount++;
      return { data: { data: structuredClone(data) } };
    },
    put: async (url, body) => {
      edits.push({ url, body });
      return { data: { ok: true } };
    },
    patch: async (url, body) => {
      calls.push({ url, body });
      if (fail) throw new Error("Sin conexión");
      const changed = body.cambios.map((change) => {
        const delivery = deliveries.find(
          (d) => d.id_pedido_vianda === change.id_pedido_vianda,
        );
        Object.assign(delivery, {
          estado: change.estado ?? delivery.estado,
          pagado: Number(change.pagado ?? delivery.pagado),
        });
        return { ...delivery };
      });
      return {
        data: {
          data: {
            entregas: changed,
            series: [
              {
                id_serie: "plan-sara",
                monto_pagado: deliveries.filter((d) => d.pagado).length * 100,
              },
            ],
          },
        },
      };
    },
  };
  const mocks = {
    react: React,
    "react-native": native,
    "@react-navigation/native": {
      useFocusEffect: (callback) => React.useEffect(callback, [callback]),
      usePreventRemove: (active, callback) => {
        guard = { active, callback };
      },
    },
    "react-native-keyboard-controller": {
      KeyboardAwareScrollView: "KeyboardAwareScrollView",
    },
    "@react-native-community/datetimepicker": () => null,
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "../components/ScreenWrapper": (props) =>
      React.createElement("Screen", props, props.children),
    "../components/UI": ui,
    "../api/api": { api, message: (e) => e.message },
    "../context/AuthContext": {
      useAuth: () => ({ session: { usuario: { rol: role } } }),
    },
    "../theme/colors": {
      __esModule: true,
      default: {},
      registerThemeListener: () => {},
    },
  };
  const filename = path.join(__dirname, "../src/screens/ViandasGestion.js");
  const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    configFile: false,
    babelrc: false,
    plugins: [
      "@babel/plugin-transform-react-jsx",
      "@babel/plugin-transform-modules-commonjs",
    ],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code + "\nexports.monthEnd = addMonth;", {
    require: (name) => {
      if (!(name in mocks)) throw new Error("Import no simulado: " + name);
      return mocks[name];
    },
    exports: module.exports,
    module,
    console,
    Intl,
    Date,
    setTimeout,
    clearTimeout,
  });
  const Component = module.exports.DetalleViandasCliente;
  assert.equal(
    module.exports.monthEnd("2026-01-31"),
    "2026-02-28",
    "Fin de febrero",
  );
  assert.equal(
    module.exports.monthEnd("2026-10-31"),
    "2026-11-30",
    "Fin de noviembre",
  );
  let screen;
  const props = {
    navigation: { dispatch() {}, navigate() {}, goBack() {} },
    route: { params: { id_cliente: 1 } },
  };
  await act(async () => {
    screen = create(React.createElement(Component, props));
  });
  const boxes = () =>
    screen.root
      .findAllByType("Pressable")
      .filter((x) => x.props.accessibilityRole === "checkbox");
  const pagination = () =>
    screen.root
      .findAllByType("Pagination")
      .find((x) => x.props.totalPages === 2);
  const applyButton = () =>
    screen.root
      .findAllByType("Button")
      .find((x) => x.props.title === "Aplicar cambios");
  const dates = () =>
    boxes()
      .filter((_, i) => i % 2 === 0)
      .map((x) => x.parent.findAllByType("Text")[0].props.children);
  const initialDates = dates();
  await act(async () => {
    for (const box of boxes()) box.props.onPress();
  });
  assert.equal(calls.length, 0, "Ninguna petición al marcar");
  assert.deepEqual(dates(), initialDates, "No se reordena al marcar");
  assert.equal(guard.active, true, "Protege cambios sin guardar");
  await act(async () => {
    pagination().props.onChange(2);
  });
  await act(async () => {
    for (let i = 0; i < boxes().length; i++)
      if (i % 2 === 0 || i < 4) boxes()[i].props.onPress();
  });
  assert.equal(calls.length, 0, "Tampoco guarda al cambiar página");
  fail = true;
  await act(async () => {
    await applyButton().props.onPress();
  });
  assert.equal(guard.active, true, "Error conserva selección");
  assert.equal(applyButton().props.disabled, false, "Permite reintentar");
  fail = false;
  await act(async () => {
    await applyButton().props.onPress();
  });
  assert.equal(calls.length, 2, "Un intento fallido y un único reintento");
  assert.equal(calls[1].url, "/viandas/clientes/1/cambios");
  assert.equal(calls[1].body.cambios.length, 15);
  assert.equal(
    calls[1].body.cambios.filter((x) => x.pagado === true).length,
    10,
  );
  assert.equal(deliveries.filter((x) => x.estado === "entregado").length, 15);
  assert.equal(deliveries.filter((x) => x.pagado).length, 10);
  assert.equal(getCount, 1, "No recarga listado al aplicar");
  assert.equal(guard.active, false, "Limpia selección guardada");
  await act(async () => {
    pagination().props.onChange(1);
  });
  assert.deepEqual(dates(), initialDates, "Mismo orden después de guardar");
  await act(async () => {
    boxes()[0].props.onPress();
  });
  await act(async () => {
    boxes()[0].props.onPress();
  });
  assert.equal(
    guard.active,
    false,
    "Desmarcar y remarcar cancela el cambio pendiente",
  );
  role = "reparto";
  await act(async () => {
    screen.update(React.createElement(Component, props));
  });
  assert.equal(
    boxes()[1].props.disabled,
    true,
    "Reparto no puede marcar cobros",
  );
  assert.equal(
    boxes()[0].props.disabled,
    false,
    "Reparto puede marcar entregas",
  );
  role = "propietario";
  await act(async () => {
    screen.update(
      React.createElement(module.exports.NuevaVianda, {
        ...props,
        route: { params: { id_cliente: 1, entrega: { ...deliveries[0] } } },
      }),
    );
  });
  await act(async () => {
    await screen.root
      .findAllByType("Button")
      .find((x) => x.props.title === "Guardar entrega")
      .props.onPress();
  });
  assert.equal(edits.length, 1, "Edición usa PUT una vez");
  assert.equal(edits[0].url, "/viandas/1");
  assert.equal(
    edits[0].body.items[0].precio_unitario,
    100,
    "Edición conserva precio original",
  );
  assert.equal(edits[0].body.fecha_entrega, "2026-11-09");
  await act(async () => screen.unmount());
});
