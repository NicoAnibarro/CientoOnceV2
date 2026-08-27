module.exports=(...roles)=>(req,res,next)=>roles.includes(req.usuario?.rol)?next():res.status(403).json({ok:false,mensaje:'Tu rol no tiene permiso para esta acción'});
