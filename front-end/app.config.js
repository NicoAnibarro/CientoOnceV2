module.exports = () => ({
  expo: {
    name: "Ciento Once V2",
    slug: "ciento-once-v2",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    owner: "cientoonce",
    ios: { supportsTablet: true },
    android: {
      package: "com.nicoanibarro.cientooncev2",
      versionCode: 2,
      softwareKeyboardLayoutMode: "resize",
      config: {
        googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY },
      },
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
    },
    web: { favicon: "./assets/favicon.png" },
    plugins: [
      "expo-secure-store",
      "@react-native-community/datetimepicker",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Ciento Once usa tu ubicación para seleccionar clientes y comenzar rutas de reparto.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Ciento Once necesita acceso a tus fotos para leer tickets de compra.",
          cameraPermission:
            "Ciento Once necesita usar la cámara para fotografiar tickets de compra.",
          microphonePermission: false,
        },
      ],
    ],
    extra: {
      apiUrl: "https://ciento-once-v2-api.onrender.com/api",
      eas: { projectId: "8e6f5174-c656-4aff-8ee3-083da5a3d075" },
    },
  },
});
