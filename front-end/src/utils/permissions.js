const managerScreens = new Set([
  "Insumos",
  "Stock",
  "Calculadora",
  "CostosProductos",
  "CategoriasProductos",
  "Informes",
  "CentroComercial",
  "Flyers",
  "ConfiguracionViandas",
  "NuevaCompra",
]);
export function canAccessScreen(role, name) {
  const manager = ["propietario", "administrador"].includes(role);
  if (managerScreens.has(name)) return manager;
  if (["NuevoPedido", "NuevaVianda"].includes(name))
    return manager || role === "ventas";
  if (name === "Productos") return manager || role === "ventas";
  if (name === "Caja") return manager || role === "caja";
  return true;
}
