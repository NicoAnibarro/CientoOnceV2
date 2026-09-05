require('dotenv').config();

(async () => {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
    contents: 'Crea una imagen cuadrada muy simple: fondo crema y un circulo verde en el centro. Sin texto.',
    config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } }
  });
  const parts = response.candidates?.[0]?.content?.parts || [];
  if (!parts.some(part => part.inlineData?.data)) throw new Error('Gemini respondio sin una imagen');
  console.log('Generacion de imagen con Gemini verificada correctamente');
})().catch(error => {
  console.error(`No se pudo generar la imagen: ${error.message}`);
  process.exit(1);
});
