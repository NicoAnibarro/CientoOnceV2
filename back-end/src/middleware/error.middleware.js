module.exports=(err,req,res,next)=>{console.error(err);res.status(err.status||500).json({ok:false,mensaje:err.status?err.message:'Ocurrió un error interno'});};
