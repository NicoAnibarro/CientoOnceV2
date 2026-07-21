function fechaValida(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')&&!Number.isNaN(Date.parse(v+'T00:00:00'))}module.exports={fechaValida};
