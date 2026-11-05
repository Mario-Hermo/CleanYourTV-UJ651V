# Adaptación UJ651V — trabajo en curso

Base original intacta en el archivo de estudio, commit
69669dcb387c39525ac668d7ae8f7c540c2cd24b. Esta copia mantiene diseño,
funciones, licencia y límites de instalación originales. No es un paquete
compatible ni instalable en webOS 3.x todavía.

La instrucción de Mario sustituye la propuesta anterior de un producto reducido:
conservar CleanYourTV y cambiar únicamente las incompatibilidades demostradas.
El objetivo incluye su función de debloat; no se ha validado su lista en la TV.

Cambios iniciales: adaptador ES5 de fetch/XHR, remove y resolución de valores
CSS anidados; materialización de variables por elemento y pseudoelemento,
regeneración tras cambios del tema, y distribución alternativa a Grid. Se
activa solo en motores sin variables CSS, antes del código original. Las
pruebas de Node no acreditan comportamiento visual ni rendimiento en la TV.

Verificación PC posterior (registro 2026-11-03): 120 comprobaciones
seleccionadas correctas con Node 8.12.0. Cuatro páginas y quince temas
originales arrancan en Chromium 38.0.2117.0 sin errores de script registrados.
Comparación de geometría del dock y todos los elementos de cuadrícula frente
al original en Edge: diferencia máxima 0.109375 píxeles CSS. Navegación por
flechas coincidente. Capa optimizada: una muestra de regeneración por tema,
6–12 ms en este PC. No equivale a prueba del hardware de la TV ni paridad píxel
a píxel. Evidencia: output/cleanyourtv-study-20261102/browser-comparison.json.

Pendientes bloqueantes:
- Comprobar motor exacto de LG, rendimiento real y comportamiento de uso
  prolongado; los ensayos de PC usan servicios y aplicaciones simulados.
- Integrar y probar el runtime privado con el servicio original. El ensayo
  temporal en ARM pasó el 2026-11-03: Node8.12, crypto, hijo Node y shell.
  Todavía no acredita DNS/TLS ni servicio completo. No está integrado en el instalador.
- Adaptar gestión de servicios, instalación y recuperación al gestor real.
- Probar API Luna, mando, Home, HDMI y sonido en la unidad exacta.
- Comprobar arquitectura de voz y procesos de debloat, sin suprimir funciones
  que todavía no se han ensayado.

Diagnóstico real por Developer Mode realizado el 2026-11-03: ARMv7/32 bits,
glibc 2.19, kernel 4.4.3 y Node 0.12.2. Sesión no root y restringida; no se
pueden deducir de ella el gestor anfitrión ni los manifiestos de Home.
No se ha instalado CleanYourTV ni obtenido root.
No quitar preflight, inventar firmware probado ni usar --force para saltarlo.

El candidato usa Node8 ARM hard-float y un cargador y bibliotecas armhf
privados: no intenta enlazar ese binario con las bibliotecas soft-float de LG.
`runtime-node.sh` inicia el cargador con `--library-path` limitado a ese
proceso. `runtime-preload.js` hace que hijos Node vuelvan a pasar por el wrapper
y antepone su bin a PATH sin alterar LD_LIBRARY_PATH. `runtime-smoke.js` se
ejecutó una vez en la TV desde una carpeta temporal autorizada. Pasaron versión,
arquitectura, hash criptográfico, hijo Node y shell; el supervisor confirmó
ausencia del grupo de procesos y la retirada de la carpeta se verificó.
Se observaron avisos de fecha antigua del tar y de un libSegFault.so del
preload de LG no disponible para el cargador privado, sin fallo del smoke.
No se alteró ese preload del sistema. Faltan DNS/TLS, integración, memoria
y pruebas de uso. No se probaron Home, Luna, servidores, debloat ni persistencia.
Los scripts originales siguen intactos; no hay runtime instalado en la TV.

Ensayo posterior del servicio original 1.6.14: cargó los 14 módulos sin fallos
de carga y arrancó HTTP en loopback. Se verificó rechazo CORS. Las operaciones
reales de TV siguen sin acreditarse: foreground/inputs/running devuelven
errores de permisos (exit126) desde Developer Mode. GET /api/config devuelve404
porque el original expone esa ruta para POST, no es una incompatibilidad nueva.
No se llamó ningún método HTTP de escritura. Se retiraron carpeta y procesos.
Esa limitación de Developer Mode se resolvió en la continuación con acceso root.

Continuación: acceso root y anfitrión ya verificados; Upstart, barra LSM sin
com.webos.app.home. El servicio original bajo root lee34 apps y6 entradas;
HTTPS responde200/TLS1.2. La app normal com.cleanyourtv.home1.5.8 está instalada;
Mario confirmó imagen, flechas y ausencia de recortes. Helper temporal retirado
y app cerrada/verificada, sin arranque ni debloat aplicados.

La integración Home preparada se activa únicamente con CYTV_LEGACY_UJ651V=1:
HOME_ID propio, mapeo de las peticiones antiguas, observador NL_HOME_SHOWN y
retorno a LG sin reiniciar. El ensayo que la activa comprueba modelo/firmware/
OTAID/SDK exactos y está limitado a tres minutos. Todavía no se ha activado.
39 comprobaciones seleccionadas pasan en PC con Node8/24; los dos fallos POSIX
de apps/manager en Windows se reprodujeron en el original. 88 comprobaciones
seleccionadas pasan con Node8/Linux ARM en fixtures temporales de la TV;
pkill neutralizado y limpieza verificada. No es la suite completa ni prueba
del Home observado en vivo. Fuente/paquetes de pruebas y recibos conservados.

Actualización posterior del 03/11: se autorizó y ejecutó el ensayo Home temporal.
Se detuvo tras un paso inesperado a Suspend con motivo registrado autoOff; no
hubo reboot del kernel ni queda observador activo, helper o carpeta temporal.
No se ha determinado qué temporizador lo provocó; los ajustes LG no se cambiaron.
Una captura real confirma reloj arriba a la izquierda, fondo oscuro y cuadrícula,
pero faltan iconos. La app se abrió solo para esa captura y volvió a cerrarse,
con ausencia verificada. Esto matiza el primer informe humano de la vista previa.
Se corrigió en PC el rechazo del origen file://com.cleanyourtv.home en webOS3:
solo con el flag legacy y una lista cerrada de apps propias. Pasan32 casos HTTP
por runtime Node8/24; no se ha aplicado ni probado la corrección en la TV todavía.
Home completo, arranque/recuperación, debloat y rendimiento siguen pendientes.
