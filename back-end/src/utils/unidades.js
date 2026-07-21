const compatibles={peso:['g','kg'],volumen:['ml','l'],unidad:['unidad']};
function unidadValida(tipo,unidad){return compatibles[tipo]?.includes(unidad)||false}module.exports={unidadValida};
