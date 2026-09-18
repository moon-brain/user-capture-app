# Orla en PSD para Photoshop

**Estado**: ✅ Plan aprobado el 2026-09-18; spike técnico superado ese mismo
día (sección 3). **Siguiente paso**: fase 0 (instalar `ag-psd`) y fase 1
(sección 10). Nada implementado todavía.
**Redactado**: 2026-09-18.
**Rama**: `feat/orla-psd`, desde `main` en 1.13.0. Se fusiona con un solo
commit `feat:` cuando el fotógrafo haya abierto el PSD de un grupo real.
**Alcance**: `Archivo > Exportar > Orla en PSD para Photoshop…` (nueva) y
`Archivo > Exportar > Actualizar una orla PSD…` (nueva). La orla en PDF no
cambia, salvo compartir con la nueva el orden alfabético y la resolución de la
foto de cada persona.

Este documento está escrito para retomarse semanas después: la sección 1 dice
qué se quiere y por qué, la 2 lo que ya está decidido, la 3 lo que se comprobó
en el spike, y de la 4 en adelante el diseño y las fases.

---

## 1. Qué se quiere

Cuando una orla se monta a mano en Photoshop, lo tedioso no es el diseño: es
colocar decenas de fotos en una rejilla, en orden alfabético por apellidos, con
el nombre bajo cada una. La aplicación ya tiene todo lo necesario para hacer esa
parte sola: la lista del grupo, las fotos y el orden.

El resultado es un PSD por grupo en el que el fotógrafo **solo hace la parte
creativa**: fondo, tipografía, marcos, revisar capturas dudosas. Tres cosas
tienen que quedar hechas de tal forma que no vuelva a tocarlas:

1. **La rejilla**, a tamaño de impresión real y con guías de Photoshop.
2. **El orden**: primer apellido, segundo apellido, nombre, con tildes y ñ bien
   ordenadas.
3. **El nombre** de cada persona como capa de texto editable, centrado bajo su
   foto.

Y una cuarta que es lo que de verdad ahorra trabajo: **cada foto va entera,
recortada por una máscara**. El fotógrafo puede deslizar la foto dentro de su
marco para reencuadrar una cara sin volver a importar nada.

## 2. Decisiones tomadas

Tomadas el 2026-09-18 con el usuario; no hay que volver a discutirlas:

| Decisión | Elección |
|---|---|
| Organización de capas | **Una carpeta por persona** (`Nombre`, `Foto`, `Marco`), no una carpeta por tipo. Mover a alguien es arrastrar su carpeta; los filtros del panel de capas por nombre o por tipo seleccionan de golpe todos los marcos o todos los textos |
| Formato del nombre | **Se elige en el asistente** entre «Nombre Apellido1 Apellido2», dos líneas (nombre / apellidos) y «Apellido1 Apellido2, Nombre» |
| Profesorado | **Lista con casillas en el asistente**; los marcados van en una carpeta `Profesorado` aparte, en sus propias filas |
| Modificaciones posteriores | **Los tres niveles** de la sección 6: regenerar (A), PSD de cambios (B) y corregir una orla ya retocada guardando copia (C). C solo tras la prueba de ida y vuelta de la fase 5 |
| Vista previa de la rejilla | **Sí**, esquemática, en el paso 2 del asistente, con la misma función que usa el generador (`src/shared/orlaLayout.js`) |
| Foto | Capa de píxeles, no objeto inteligente. A 300 ppp no falta resolución y se abre en cualquier versión. Objetos inteligentes, fuera de alcance |
| Biblioteca | `ag-psd` (JavaScript puro, sin módulo nativo). Las fotos se le dan como RGBA crudo de `sharp`; no hace falta canvas para escribir |
| Verificación | Photoshop 2025 y 2026 están instalados en el equipo de desarrollo |
| Grupos | **Un conjunto de grupos por orla**: las orlas de presentación suelen combinar varios grupos del mismo nivel. Se marcan en una lista; también se puede pedir una orla por cada grupo marcado |
| Márgenes y separación | Cada uno **en cm o en % de la dimensión** correspondiente del documento (izquierda/derecha y separación horizontal sobre el ancho; arriba/abajo y separación vertical sobre el alto) |
| Cabecera | **Arriba o entre el profesorado y el alumnado**; a veces se inserta entre las filas de unos y otras |

## 3. Resultado del spike (2026-09-18)

Script en el scratchpad de la sesión (`psd-spike/spike.js`); lo esencial está
en el apéndice A para no depender de él. Mini orla de 20 × 15 cm a 300 ppp,
tres columnas, cuatro personas (dos con fotos con orientación EXIF, una
compartida, una sin foto), cabecera, guías, colores de carpeta e imagen
compuesta. `ag-psd` 31.0.2.

**Generación**: 0,6 s y 8,3 MB. `ag-psd` escribe sin canvas si se le da
`imageData` (`{ width, height, data: Uint8ClampedArray }`).

**Abierto en Photoshop 2026, comprobado por el usuario**, los cinco puntos bien:

1. Pide «actualizar las capas de texto» al abrir. Con **Actualizar**, nombres y
   título se dibujan (Arial, negro, centrados). Es el comportamiento documentado
   de `ag-psd`: no dibuja el mapa de bits del texto.
2. Orden del panel: Cabecera → Alumnado (`01` arriba) → Fondo. Carpeta sin foto
   en rojo, foto compartida en amarillo.
3. `Foto` aparece recortada sobre `Marco` (máscara de recorte) y se desliza
   dentro del marco con la herramienta Mover sin que asome nada.
4. `Marco` es una forma vectorial: trazado visible, opciones de forma, radio de
   esquina editable.
5. Guías en los bordes de columnas y filas; 20 × 15 cm a 300 ppp.

**Otras cosas aprendidas**, que condicionan el diseño:

- `sharp` rasteriza texto SVG con Arial en Windows, tildes, ñ y º incluidos.
  Sirve para la **imagen compuesta** (lo que ven el Explorador, Bridge y los
  visores). No se usa para el mapa de bits de las capas de texto: es más simple
  aceptar el aviso de Photoshop que igualar su motor de texto.
- `ag-psd` **descarta al leer los bloques que no conoce** (`Unhandled
  additional info` → `skipBytes`). Reescribir el archivo de otro es perder lo
  que no entienda. Por eso el nivel C guarda siempre una copia y necesita la
  prueba de la fase 5.
- `ag-psd` soporta el identificador de capa (`id`, bloque `lyid`) y los
  metadatos XMP (`imageResources.xmpMetadata`, recurso 1060). Son lo que
  necesitan B y C para reconocer a cada persona aunque el fotógrafo renombre o
  mueva carpetas.
- Para **leer** píxeles hace falta darle una función `createImageData`
  (`initializeCanvas(createCanvas, createImageData)`); para leer solo la
  estructura y el XMP se salta todo con `skipLayerImageData`,
  `skipCompositeImageData` y `skipThumbnail`, y es inmediato.
- Los puntos de un trazado van en píxeles como `[x0, y0, x1, y1, x2, y2]`
  (ancla en el medio, controles a los lados); un rectángulo son cuatro nudos
  con los tres puntos iguales. `children[0]` es la capa **de abajo**.

## 4. El archivo PSD

### 4.1 Documento

- Tamaño en cm y ppp elegidos en el asistente; por defecto 50 × 70 cm vertical
  a 300 ppp (5906 × 8268 px). RGB, 8 bits por canal.
- Límite de PSD: 30 000 px de lado. `computeOrlaLayout()` lo comprueba y el
  asistente no deja pasar (a 300 ppp son 254 cm; no es un caso real, pero un
  ppp disparatado sí puede serlo).
- Resolución en `resolutionInfo` (ppp y unidades en centímetros), así
  **Imagen > Tamaño de imagen** enseña las medidas en cm.
- Una orla combina **uno o varios grupos**. El archivo se llama
  `Orla_<códigos>.psd`, con los códigos unidos por `+` en el orden del
  proyecto (`Orla_2BACH-A+2BACH-B.psd`), en la carpeta elegida con
  `selectExportFolder()`, como el resto de exportaciones. Con «una orla por
  grupo» se generan tantos archivos como grupos marcados, con los mismos
  parámetros.
- El alumnado de una orla combinada va **todo junto por orden alfabético**
  (es lo habitual en una orla de nivel), o **por grupo**, un bloque por cada
  uno con su nombre como subtítulo, según se elija en el asistente.

### 4.2 Capas

De arriba abajo en el panel de Photoshop:

```
📁 Cabecera
   T  Título                       texto editable
   T  Subtítulo                    texto editable
   🖼 Logotipo                      solo si hay logotipo en Preferencias
📁 Profesorado                     solo si se marcó a alguien
   📁 01 · Apellido1 Apellido2, Nombre
      T  Nombre
      🖼 Foto                       recortada sobre Marco
      ▭  Marco                     forma vectorial
   …
📁 Alumnado
   📁 01 · García López, Ana
      T  Nombre                    texto editable, centrado bajo el marco
      🖼 Foto                       la foto entera, escalada, recortada por Marco
      ▭  Marco                     rectángulo 3:4 (o la proporción elegida)
   📁 02 · Gómez Ruiz, Pablo
   …
   📁 27 · Zapata Mora, Luis (sin foto)
      T  Nombre
      ▭  Marco                     relleno gris; no hay capa Foto
📁 Fondo
   ▭  Fondo                        relleno blanco, para que lo sustituya
```

La carpeta `Cabecera` va siempre arriba del panel; su **posición en el
lienzo** es arriba o entre las filas del profesorado y las del alumnado, según
se elija. Con el alumnado **por grupo**, dentro de `Alumnado` hay una carpeta
por grupo (`2BACH-A`, `2BACH-B`…) con una capa de texto `Grupo` y las carpetas
de sus personas, numeradas de nuevo desde `01`.

Reglas:

- **Nombres de capa fijos**: `Nombre`, `Foto`, `Marco`, siempre iguales. Es lo
  que permite al fotógrafo filtrar el panel por nombre y cambiar la tipografía
  de los 27 nombres o pegar un estilo a los 27 marcos de una vez.
- **Carpeta de persona**: `NN · Apellido1 Apellido2, Nombre`, numerada en el
  orden de la rejilla y **siempre** con el formato apellidos-nombre, sea cual
  sea el formato elegido para el texto visible: es para buscar en el panel, no
  para imprimir. Sufijo ` (sin foto)` cuando no hay foto. Carpetas cerradas
  (`opened: false`); `Alumnado`, `Profesorado` y `Cabecera` abiertas, `Fondo`
  cerrada.
- **Color de carpeta** (`layerColor`): `red` sin foto, `yellow` si la misma foto
  está enlazada a más de una persona del proyecto (dato que la lista ya calcula
  para los indicadores de duplicados), `none` en el resto. Es la lista de
  "revisar" del fotógrafo sin abrir nada.
- **Identificador de capa** (`id`) en cada carpeta de persona y en sus tres
  capas, correlativos y guardados también en el XMP (4.4). Photoshop los
  conserva aunque se renombre o se mueva la carpeta; las capas que él añada
  reciben números nuevos.
- **Orden en el array**: `ag-psd` escribe `children[0]` abajo, así que las
  personas se añaden en orden inverso para que `01` quede arriba del panel, y
  los grupos raíz van `[Fondo, Alumnado, Profesorado, Cabecera]`.

### 4.3 Cada capa

**Marco**: `vectorMask` con un trazado rectangular en píxeles y `vectorFill`
de color (`{ type: 'color', color }`), es decir, una capa de relleno sólido con
máscara vectorial, que es lo que Photoshop llama forma. Blanco con foto, gris
`#e0e0e0` sin foto. `top/left/bottom/right` con el rectángulo.

**Foto**: se lee con `sharp(ruta).rotate()` (respeta la orientación EXIF, como
todas las exportaciones), se escala para **cubrir** el marco (`max(anchoMarco /
ancho, altoMarco / alto)`) **sin recortar**, y se centra sobre él. `clipping:
true`, colocada justo encima de `Marco`. Lo que sobresale lo oculta la máscara
de recorte. RGBA crudo con `ensureAlpha().raw()`.

Si la ruta de la foto no existe en disco (enlace roto), la persona se trata
como sin foto y se cuenta aparte en el resumen final.

**Nombre**: capa de texto de punto (`shapeType: 'point'`), `justification:
'center'`, `transform` con el centro del marco en x y la línea base en y, fuente
`ArialMT` (nombre PostScript; está en Windows y macOS), negro. Tamaño: 42 % de
la altura reservada al nombre, con un ajuste hacia abajo si el nombre más largo
del grupo no cabría en el ancho de la celda a ese tamaño (estimación con 0,55
em por carácter; es orientativo, el fotógrafo cambiará la fuente). Todos los
nombres del archivo llevan el mismo tamaño. En el formato de dos líneas el
texto lleva `\n` y la línea base sube media línea.

**Título y Subtítulo**: texto de punto centrado en el ancho del documento,
dentro del espacio reservado a la cabecera. Título 35 % de esa altura,
subtítulo 20 %.

**Logotipo**: la imagen de `config.logoPath` (la misma de recibos y PDF), como
capa de píxeles a la izquierda de la cabecera, con la altura de esta menos
márgenes. Si no hay logotipo, no hay capa.

**Fondo**: forma vectorial blanca del tamaño del documento, en su carpeta, para
que el fotógrafo la sustituya o ponga la suya encima.

### 4.4 Metadatos: lo que hace falta para volver a la orla

Van en el XMP del PSD (`imageResources.xmpMetadata`), en un paquete XMP mínimo
con una propiedad propia que contiene JSON:

```json
{
  "format": "edu-user-capture/orla-psd",
  "version": 1,
  "appVersion": "1.14.0",
  "exportedAt": "2026-09-18T18:40:00+02:00",
  "project": { "name": "IES Ejemplo 2026-27" },
  "groups": [
    { "code": "2BACH-A", "name": "2º Bachillerato A" },
    { "code": "2BACH-B", "name": "2º Bachillerato B" }
  ],
  "studentsOrder": "together",
  "photoSource": "captured",
  "nameFormat": "first-last",
  "layout": { "...": "los parámetros de entrada de computeOrlaLayout()" },
  "people": [
    {
      "layerId": 12, "userId": 318, "kind": "student", "groupCode": "2BACH-A",
      "index": 0, "cell": { "col": 0, "row": 0 },
      "name": { "first": "Ana", "last1": "García", "last2": "López" },
      "photo": { "path": "…/imports/20260915101233.jpg", "mtimeMs": 1757930000000, "size": 412345 }
    }
  ]
}
```

- Va **dentro del archivo**, no en un archivo al lado: el PSD viaja al
  fotógrafo y vuelve, y lo que importa es lo que hay en *ese* archivo.
- `layout` son los parámetros de entrada, no el resultado: con ellos y la
  función compartida se recalcula la misma rejilla.
- `photo` guarda ruta, tamaño y fecha para que C detecte fotos cambiadas
  (reenlazadas o giradas) sin comparar píxeles.
- Se lee con `readOrlaPsdInfo(ruta)`: `readPsd` saltando píxeles y miniatura.
  Un PSD sin esta propiedad no es una orla de la aplicación y B y C lo rechazan
  con un mensaje claro.
- Photoshop conserva el XMP al guardar. Si él edita metadatos (poco probable),
  la propiedad propia sobrevive porque va en su propio espacio de nombres.

### 4.5 Guías e imagen compuesta

- **Guías** (`gridAndGuidesInformation.guides`): verticales en los dos bordes de
  cada columna, horizontales en el borde superior de cada fila, el inferior de
  la foto y el inferior de la zona del nombre. Y una horizontal en la base de la
  cabecera.
- **Imagen compuesta** (`psd.imageData`): fondo blanco, fotos recortadas al
  marco (`fit: 'cover'`), gris para quien no tiene foto, y los textos como
  capa SVG rasterizada por `sharp`. Es lo que se ve sin abrir Photoshop. A
  5906 × 8268 px son 195 MB de RGBA en memoria durante la escritura; ver
  riesgos (sección 9).

## 5. La rejilla: `src/shared/orlaLayout.js`

Función pura, sin dependencias, cargada por los dos procesos:

- renderer: `<script src="../shared/orlaLayout.js">` en `index.html`, antes de
  los modales, con el mismo patrón IIFE/UMD de los componentes.
- main: `require('../shared/orlaLayout')` desde `orlaPsd.js`.
- tests: `tests/unit/shared/orlaLayout.test.js`, en Node, sin DOM.

`src/shared` existe en el repositorio pero está vacía; el empaquetado lleva
`src/**/*`, así que no hay que tocar `package.json`.

### 5.1 Entrada

```js
{
  page: { widthCm: 50, heightCm: 70, ppi: 300 },       // ya orientado
  // Cada medida es { value, unit } con unit 'cm' o '%'. El % es sobre la
  // dimensión del documento que corresponde: ancho para izquierda, derecha y
  // gapX; alto para arriba, abajo y gapY
  margins: { top: m(3), right: m(3), bottom: m(3), left: m(3) },
  header: { size: m(8), position: 'top' },              // 'top' | 'between'
  columns: 6,
  photoRatio: 0.75,                                     // ancho / alto: 3:4
  gapX: m(0.8), gapY: m(0.6),
  nameCm: 1.2,                                          // alto zona del nombre
  blockGapCm: 1.5,                                      // entre bloques
  centerLastRow: true,
  blocks: [                                             // en orden de arriba abajo
    { kind: 'teachers', count: 4 },
    { kind: 'students', count: 27 }                     // o uno por grupo, con label
  ]
}
```

`m(3)` es `{ value: 3, unit: 'cm' }`; `{ value: 5, unit: '%' }` es un 5 % de
la dimensión que toque. La conversión a píxeles la hace la propia función,
para que el asistente y el generador no puedan discrepar.

### 5.2 Salida

```js
{
  page: { width, height },                              // px
  header: { top, height },                              // donde haya quedado
  cell: { photoWidth, photoHeight, nameHeight, height },// px
  blocks: [                                             // en orden de arriba abajo
    { kind: 'teachers', top, rows, cells: [{ index, col, row, left, top }] },
    { kind: 'students', label, top, rows, cells: [...] }
  ],
  guides: [{ direction, location }],
  fits: true, overflowPx: 0,
  warnings: ['photo-too-small', ...]
}
```

### 5.3 Reglas

- cm → px con `Math.round(cm / 2.54 * ppi)`; % → px con
  `Math.round(dimensión × valor / 100)`. Todo lo demás en píxeles enteros.
- Ancho de foto: `(anchoÚtil − gapX × (columnas − 1)) / columnas`, redondeado
  hacia abajo; alto por la proporción. El resto del ancho se reparte para
  centrar la rejilla.
- Filas: `ceil(n / columnas)` por bloque, en el orden dado, separados por
  `blockGapCm`; mismas celdas en todos. Un bloque con `label` (alumnado por
  grupo) reserva encima una línea para el nombre del grupo.
- Cabecera: con `position: 'top'` va bajo el margen superior y los bloques
  debajo; con `'between'` va después del primer bloque de profesorado y antes
  del primero de alumnado, y si no hay profesorado se comporta como `'top'`.
- `centerLastRow`: la última fila de cada bloque se centra si está incompleta.
- `fits`: el bloque de abajo no pasa del margen inferior. Si no cabe,
  `overflowPx` dice cuánto, y el asistente propone la solución (más columnas o
  menos margen).
- Avisos: foto de menos de 3 cm de ancho (`photo-too-small`), lado de más de
  30 000 px (`page-too-large`), nombre de menos de 0,6 cm (`name-too-small`).
- `suggestColumns({ students, teachers, page, … })`: el menor número de
  columnas con el que cabe todo con foto de al menos 4 cm; es el valor por
  defecto del asistente para ese grupo.

## 6. Modificar una orla ya entregada

Tres niveles; los tres entran en el alcance, en fases distintas.

**A. Regenerar.** Volver a exportar el grupo. Con los nombres de capa fijos, el
fotógrafo reaplica tipografía y estilos en un par de minutos y arrastra su fondo.
Sin riesgo. Es lo que hay desde la fase 3.

**B. PSD de cambios.** Elegir el PSD original; la aplicación lee su XMP y
genera **otro** PSD del mismo tamaño solo con las personas que se marquen
(normalmente las que no estaban), cada una en la celda que le tocaría por orden
alfabético recalculado, o al final si se prefiere no alterar el orden. El
fotógrafo arrastra esas carpetas a su archivo con Mayús y caen en su sitio. No
se toca su archivo. Fase 4.

**C. Corregir en el sitio.** Elegir el PSD retocado; la aplicación compara su
XMP con el proyecto y enseña lo que ha cambiado desde la exportación:

- nombres distintos (XML actualizado);
- fotos distintas (reenlazada, o girada: ruta, tamaño o fecha cambian);
- personas nuevas en el grupo;
- personas que ya no están (solo se informa; no se borra nada).

Se marca lo que se quiere aplicar y se guarda **como archivo nuevo**
(`Orla_<código>_corregida.psd`), nunca encima. Nombre: se cambia `text.text` de
la capa `Nombre` (localizada por `id`, no por nombre) y se escribe con
`invalidateTextLayers`. Foto: se sustituye `imageData` de `Foto` conservando
su escala y su desplazamiento relativo al marco (si el fotógrafo la había
recolocado, la nueva cae igual). Persona nueva: se añade su carpeta en la
siguiente celda libre del bloque, sin reordenar; si no hay celda libre, se avisa
y se ofrece el nivel B. El riesgo de perder lo que `ag-psd` no conoce no
desaparece: por eso la fase 5 empieza por la prueba de ida y vuelta con un
archivo retocado de verdad, y C no se activa hasta que pase.

## 7. Interfaz

### 7.1 Menú

En **Archivo > Exportar**, después de «Orlas en PDF»:

- **Orla en PSD para Photoshop…** → `menu-export-orla-psd`
- **Actualizar una orla PSD…** → `menu-update-orla-psd` (niveles B y C)

Ambas necesitan proyecto abierto; sin él, el aviso habitual.

### 7.2 Asistente de exportación (`OrlaPsdExportModal`)

Un solo modal con cuatro pasos y botones **Cancelar · Atrás · Siguiente /
Exportar**. Indicador de paso arriba («Paso 2 de 4 · Documento»). `Intro`
avanza (`defaultButtonSelector`), `Esc` cancela (`data-modal-cancel` en
Cancelar). Cada paso valida antes de dejar avanzar y muestra el error en su
`.modal-error`, como los demás modales.

Valores recordados en `config.json` bajo `orlaPsd` (formato del documento,
columnas, proporción, márgenes, nombre, cabecera): son preferencias del
fotógrafo. Los docentes marcados se recuerdan por proyecto en
`project_settings` (`orlaPsdTeachers`, lista de ids): no cambian de un grupo a
otro del mismo centro.

**Paso 1 · Qué exportar**

| Control | Detalle |
|---|---|
| Grupos | Lista con casillas de los grupos del proyecto, con el número de personas de cada uno; el grupo filtrado en la lista viene marcado. **Marcar todos / Ninguno** |
| Cómo | **Una orla con los grupos marcados** (por defecto) o **Una orla por cada grupo marcado** |
| Orden del alumnado | Solo con varios grupos en una orla: **Todos juntos, por orden alfabético** (por defecto) o **Por grupo**, un bloque por grupo con su nombre |
| Fuente de fotos | **Capturadas** / **Depósito**, como la orla en PDF |
| Profesorado | Lista con casillas de los usuarios de tipo docente: nombre y si tiene foto en la fuente elegida. **Marcar todos / Ninguno**. Vacía por defecto la primera vez, después lo último marcado |

**Paso 2 · Documento**

| Control | Detalle |
|---|---|
| Tamaño | Preajustes **50 × 70**, **40 × 60**, **30 × 40**, **A3 (29,7 × 42)** o **Personalizado** (ancho y alto en cm) |
| Orientación | Vertical / Horizontal |
| Resolución | 300 ppp por defecto; 150, 200, 300, 600 |
| Márgenes | Un valor para los cuatro, con **Avanzado** que los separa. Cada uno con su selector de unidad, **cm** o **%** de la dimensión correspondiente (ancho para izquierda y derecha, alto para arriba y abajo) |
| Cabecera | Alto reservado en cm (8 por defecto); 0 la quita. **Posición**: **Arriba** o **Entre el profesorado y el alumnado** (solo activa si se marcó algún docente) |
| Columnas | Número; por defecto `suggestColumns()` para la orla. Con «una orla por grupo» se calcula para el grupo mayor |
| Proporción de la foto | 3:4, 2:3, 1:1 |
| Separación | Horizontal y vertical, cada una en **cm** o **%** (del ancho y del alto del documento, respectivamente) |
| Última fila | Casilla **Centrar la última fila** |
| Vista previa | Dibujo esquemático (SVG o canvas) del documento con la cabecera, los bloques y las celdas, recalculado con cada cambio, y el texto «6 columnas × 5 filas · foto 6,8 × 9,1 cm · nombre 1,2 cm». Los avisos de `warnings` salen en ámbar; `fits: false` en rojo y bloquea Siguiente |

**Paso 3 · Textos**

| Control | Detalle |
|---|---|
| Formato del nombre | «Nombre Apellido1 Apellido2» / «Nombre» sobre «Apellido1 Apellido2» / «Apellido1 Apellido2, Nombre», con un ejemplo real del grupo al lado |
| Título | Texto; por defecto `centerName` de Preferencias y el nombre del grupo, o de los grupos separados por «·»: «IES Ejemplo · 2º Bachillerato A · 2º Bachillerato B». Con «una orla por grupo», `{grupo}` se sustituye en cada una |
| Subtítulo | Texto; por defecto «Curso 2026-2027» (de septiembre a diciembre, año actual–siguiente; de enero a agosto, anterior–actual) |
| Logotipo | Casilla, solo si hay logotipo configurado |

**Paso 4 · Resumen y destino**

- Lo que se va a generar: grupos y cuántas orlas, personas con foto, **sin
  foto** (irán en rojo), **fotos compartidas** (amarillo), docentes, documento
  y ppp, nombre de archivo(s) y tamaño aproximado.
- **Exportar** pide la carpeta con `selectExportFolder()` y lanza la
  exportación con el modal de progreso (`ProgressManager`), una entrada por
  persona.
- Al terminar, `InfoModal` con los archivos generados y **la nota de que
  Photoshop pedirá actualizar las capas de texto al abrir, y que hay que
  aceptar**. Lo mismo está en el manual.

### 7.3 Actualizar una orla PSD (`OrlaPsdUpdateModal`)

1. Botón **Elegir archivo…** (`showOpenDialog` del sistema con filtro `.psd`).
   Se lee con `readOrlaPsdInfo()`; si no es una orla de la aplicación o alguno
   de sus grupos no está en el proyecto, error en el modal.
2. Ficha del archivo: grupos, fecha de exportación, tamaño, cuántas personas
   lleva.
3. Cambios detectados respecto al proyecto, cada uno con su casilla:
   nombres corregidos, fotos cambiadas, personas nuevas, personas que ya no
   están (informativo).
4. Modo:
   - **PSD de cambios** (B): genera `Orla_<código>_cambios.psd` con las
     personas marcadas. Opción «en la celda que les corresponde por orden» o
     «al final».
   - **Copia corregida** (C): aplica los cambios marcados y guarda
     `Orla_<código>_corregida.psd`. Deshabilitado, con explicación, hasta que
     la fase 5 lo active.
5. Carpeta con `selectExportFolder()`, progreso, resumen.

## 8. Cambios por módulo

| Dónde | Qué |
|---|---|
| `package.json` | `ag-psd` en `dependencies` |
| `src/shared/orlaLayout.js` | Sección 5. Nuevo; estrena la carpeta |
| `src/main/orlaPsd.js` | Nuevo. `buildOrlaPsd(spec)` → `Buffer`; `readOrlaPsdInfo(ruta)`; `buildChangesPsd(info, personas, spec)` (B); `applyOrlaChanges(ruta, cambios)` (C). Helpers: `rectPath`, `shapeLayer`, `textLayer`, `photoLayer`, `buildComposite`, `writeOrlaMetadata` / `readOrlaMetadata`. Cede el bucle de eventos cada pocas fotos (`setImmediate`) y avisa de progreso por callback |
| `src/main/utils/formatting.js` | `compareUsersByName(a, b)` con `Intl.Collator('es', { sensitivity: 'base' })`. La orla en PDF pasa a usarlo (hoy ordena con `toLowerCase` + `localeCompare` sin locale) |
| `src/main/ipc/exportHandlers.js` | Handlers `export-orla-psd`, `read-orla-psd-info`, `update-orla-psd`. Se extrae de `export-orla-pdf` la resolución de la ruta de la foto (`resolveOrlaPhotoPath(user, photoSource, repositoryPath, mirror)`) y la comparten los dos. Reutiliza `loadInstitutionLogo()` y `sendProgressUpdate()` |
| `src/main/utils/config.js` | `getOrlaPsdPreferences()` / `saveOrlaPsdPreferences()` bajo `orlaPsd` |
| `src/main/database.js` | Nada: `orlaPsdTeachers` usa `getProjectSetting` / `setProjectSetting` |
| `src/main/menu/menuBuilder.js` | Las dos entradas de 7.1 |
| `src/preload/preload.js` | `onMenuExportOrlaPSD`, `onMenuUpdateOrlaPSD`, `exportOrlaPSD(data)`, `readOrlaPsdInfo(path)`, `updateOrlaPSD(data)`, `getOrlaPsdPreferences()`, `saveOrlaPsdPreferences()`; el selector de archivo `.psd` con el `showOpenDialog` genérico que ya expone el preload |
| `src/renderer/components/modals/OrlaPsdExportModal.js` | El asistente (7.2). Extiende `BaseModal`; mantiene el paso actual y el estado del formulario; `show({ groups, users, teachers, preferences, centerName, hasLogo })` devuelve las opciones o `null` |
| `src/renderer/components/modals/OrlaPsdUpdateModal.js` | 7.3 |
| `src/renderer/components/OrlaExportManager.js` | `exportOrlaPSD()` y `updateOrlaPSD()`: agrupan usuarios, llaman al modal, al handler y muestran el resultado. Mismo patrón que `exportOrlaPDF()` |
| `src/renderer/components/MenuEventManager.js` | `onExportOrlaPSD`, `onUpdateOrlaPSD` |
| `src/renderer/renderer.js` | Instanciar e inicializar los dos modales, pasarlos al manager, dos handlers de menú |
| `src/renderer/index.html` | Marcado de los dos modales, ambos con `data-modal-cancel` en Cancelar (`modalEscape.test.js` lo exige); `<script>` de `../shared/orlaLayout.js` y de los dos modales |
| CSS | Estilos del asistente (indicador de pasos, lista de docentes con scroll, vista previa) junto a los de `.orla-modal-content` |
| `src/help/orla-psd.md` + `pages.json` | Página nueva «Orla para Photoshop», detrás de «Orlas, pagos y recibos»: qué se obtiene, el asistente paso a paso, cómo está organizado el archivo y cómo aprovecharlo en Photoshop (filtros de capa, reencuadrar, el aviso de capas de texto), y actualizar una orla. Enlaces desde `exportaciones.md`, `orlas.md` e `inicio.md` |
| `CLAUDE.md` | `orlaPsd.js`, `orlaLayout.js`, los modales y la exportación en la lista de exportaciones |

### 8.1 Tests

| Test | Cubre |
|---|---|
| `tests/unit/shared/orlaLayout.test.js` | Cálculo de celdas, filas, centrado de última fila, bloque de profesorado, `fits`, avisos, `suggestColumns`, redondeos (ninguna celda pisa otra ni el margen) |
| `tests/unit/main/orlaPsd.test.js` | Genera un PSD con fotos reales pequeñas y lo relee con `readPsd`: árbol de capas y orden, nombres, `clipping`, `vectorMask`, ids, colores, guías, resolución, XMP; `readOrlaPsdInfo`; B y C sobre un PSD generado y luego modificado por el test (renombrar carpetas, mover capas) para comprobar que localiza por `id` |
| `tests/unit/main/exportOrlaPsdHandler.test.js` | Handler con `ipcMain` mockeado, base de datos y archivos en un directorio temporal, como `exportImagesHandler.test.js`: archivos generados, personas sin foto, enlace roto, progreso, lista vacía |
| `tests/unit/main/formatting` | `compareUsersByName` con tildes, ñ, mayúsculas y apellidos vacíos |
| `tests/unit/components/modals/OrlaPsdExportModal.test.js` | Navegación entre pasos, validaciones, valores por defecto, vista previa reaccionando, persistencia de preferencias, cancelar en cualquier paso devuelve `null` |
| `tests/unit/components/modals/OrlaPsdUpdateModal.test.js` | Archivo no válido, lista de cambios, modos |
| Existentes | `modalEscape.test.js` (botón de cancelar), `helpContent.test.js` (página y enlaces), `windowManagers.test.js` (no aplica, no hay ventana nueva) |

Los tests del proceso principal llevan `@jest-environment node` y timers
reales, como los demás. Las fotos de prueba se generan con `sharp` en el propio
test (degradados de 200 × 267 px), no se guardan binarios en el repositorio.

## 9. Riesgos y cómo se tratan

| Riesgo | Tratamiento |
|---|---|
| **Memoria**: a 50 × 70 cm y 300 ppp la compuesta son 195 MB RGBA, más las fotos (unos 2–4 MB cada una escaladas). Un grupo de 35 ronda 300–400 MB en memoria durante la escritura | Se mide en la fase 2 con un grupo real. Si aprieta: compuesta a mitad de resolución escalada (Photoshop la regenera al guardar), y `writePsd` de una en una por grupo, nunca varias en paralelo |
| **Tiempo**: `sharp` escala 35 fotos en un par de segundos; `ag-psd` comprime RLE en JS. Estimación 5–15 s por grupo | Progreso por persona y `setImmediate` entre fotos para no congelar la ventana, como hace el PDF |
| **Tamaño en disco**: 100–200 MB por grupo | Se dice en el resumen antes de exportar. Si el destino es una carpeta de Drive, tardará en subir; nada que hacer desde aquí |
| Aviso «actualizar capas de texto» en cada apertura del archivo recién generado | Se acepta y se documenta. Solo sale la primera vez: al guardar desde Photoshop ya lleva el mapa de bits |
| `ag-psd` descarta bloques desconocidos al reescribir (C) | Copia nueva siempre; prueba de ida y vuelta de la fase 5 con un archivo retocado de verdad; lista de comprobación en 10.5 |
| Fuente `ArialMT` no instalada | En Windows y macOS siempre está. Photoshop la sustituye avisando; el fotógrafo la cambiará de todos modos |
| Foto enlazada cuyo archivo falta | Se trata como sin foto, en rojo, y se cuenta aparte en el resumen |
| Fotos compartidas entre personas | Dos capas independientes, ambas carpetas en amarillo |
| Docente en varios grupos | Sale en cada PSD que lo incluya; es lo esperado |
| Nombres muy largos | Tamaño de fuente único calculado con el más largo; el formato de dos líneas es la salida natural |
| Photoshop 2025 frente a 2026 | Se abre en los dos al final de cada fase |

## 10. Fases

Cada fase acaba con algo comprobable y con su commit `feat:` o `test:`,
después de preguntar si se pasan los tests, como manda `CLAUDE.md`.

### Fase 0 · Preparación (hecha en parte)

- [x] Rama `feat/orla-psd`.
- [x] Spike en Photoshop (sección 3).
- [x] Este plan revisado y aprobado (2026-09-18).
- [ ] `npm install ag-psd`.

### Fase 1 · Rejilla

- `src/shared/orlaLayout.js` con sus tests.
- Se puede comprobar sin interfaz: un script en el scratchpad dibuja la salida
  como SVG para verla.

### Fase 2 · Generador

- `src/main/orlaPsd.js` completo: capas, foto, texto, guías, compuesta, XMP,
  ids. `compareUsersByName` en `formatting.js`.
- Tests de ida y vuelta con `readPsd`.
- Comprobación en Photoshop con un PSD de un grupo del proyecto real generado
  desde un script del scratchpad que llama al módulo (sin interfaz todavía).
  Aquí se miden memoria y tiempo (riesgos de la sección 9) y se decide la
  resolución de la compuesta.

### Fase 3 · Exportación desde la aplicación (nivel A)

- Handler `export-orla-psd`, preload, menú, asistente de cuatro pasos,
  `OrlaExportManager.exportOrlaPSD()`, preferencias, manual, `CLAUDE.md`.
- Tests del handler y del modal.
- **Primera entrega**: exportar un grupo real y dárselo al fotógrafo. Su
  respuesta decide ajustes de rejilla, tamaños por defecto y textos antes de
  seguir.

### Fase 4 · PSD de cambios (nivel B)

- `readOrlaPsdInfo`, `buildChangesPsd`, handler, `OrlaPsdUpdateModal` con el
  modo B, manual.
- Prueba: exportar un grupo, quitar a dos personas del XML, exportar, volver a
  ponerlas, generar el PSD de cambios y arrastrarlas al original en Photoshop.

### Fase 5 · Copia corregida (nivel C)

1. **Prueba de ida y vuelta, antes de escribir nada**: un PSD de la fase 3
   retocado por el fotógrafo (fondo, tipografía, estilos de capa, alguna foto
   recolocada, quizá un objeto inteligente) se lee y se reescribe con `ag-psd`
   sin cambios, y se abre en Photoshop al lado del original. Lista de
   comprobación en 10.5. Si se pierde algo relevante, se documenta aquí y C se
   queda desactivado con su explicación en el modal y en el manual; B lo cubre.
2. Si pasa: `applyOrlaChanges`, handler `update-orla-psd`, modo C del modal,
   tests con un PSD generado y modificado por el propio test, manual.

### 10.5 Lista de comprobación en Photoshop

Para el final de las fases 2, 3 y 5, en 2025 y 2026:

- Abre sin más aviso que el de las capas de texto; con Actualizar, los textos se
  dibujan.
- Panel de capas con el orden, nombres, colores y carpetas de 4.2.
- `Foto` recortada sobre `Marco` y desplazable dentro de él; `Marco` editable
  como forma.
- Guías en su sitio; tamaño e imagen en cm y ppp correctos.
- Filtro del panel por nombre `Nombre` selecciona todos los textos; cambiar la
  fuente con todos seleccionados los cambia todos.
- Miniatura en el Explorador y en Bridge (imagen compuesta).
- Fase 5 además: todo lo que el fotógrafo añadió sigue en la copia (fondo,
  estilos, objetos inteligentes, máscaras, ajustes, composiciones), y los
  cambios aplicados se ven.

## 11. Fuera de alcance

- Marcos ovalados o con esquinas redondeadas de serie (el fotógrafo edita el
  vector; una opción de radio de esquina en el asistente sería trivial de
  añadir después).
- Objetos inteligentes en lugar de capas de píxeles.
- Elegir la fuente en el asistente.
- Fondos o plantillas de diseño.
- CMYK; PSB (documentos de más de 30 000 px).
- Editar el PSD del fotógrafo en su sitio: siempre copia.

## 12. Preguntas abiertas

Por confirmar con el fotógrafo tras la fase 3; hasta entonces, los valores
por defecto indicados:

- Profesorado arriba (por defecto) o abajo del alumnado. (Arriba o entre
  ambos ya lo decide la posición de la cabecera.)
- Última fila centrada (por defecto) o alineada a la izquierda.
- En una orla de varios grupos, si «todos juntos» es de verdad lo habitual o
  se pide más «por grupo».
- Tamaños de preajuste que realmente usa.
- Si prefiere recibir además las fotos originales en una carpeta al lado del
  PSD (no está previsto; sería un ZIP como el de inventario).

---

## Apéndice A · Fragmentos verificados del spike

Con `ag-psd` 31.0.2 y `sharp` 0.34. Es lo que la fase 2 debe reproducir.

```js
// Rectángulo como trazado: cuatro nudos sin curvatura
function rectPath(left, top, width, height) {
  const corner = (x, y) => ({ linked: false, points: [x, y, x, y, x, y] });
  return {
    open: false, operation: 'combine', fillRule: 'non-zero',
    knots: [corner(left, top), corner(left + width, top),
            corner(left + width, top + height), corner(left, top + height)],
  };
}

// Forma vectorial = relleno sólido con máscara vectorial
function shapeLayer(name, rect, color) {
  return {
    name, top: rect.top, left: rect.left,
    bottom: rect.top + rect.height, right: rect.left + rect.width,
    vectorMask: { paths: [rectPath(rect.left, rect.top, rect.width, rect.height)] },
    vectorFill: { type: 'color', color },
  };
}

// Texto de punto centrado en (centerX, baselineY)
function textLayer(name, text, centerX, baselineY, fontSize) {
  return {
    name,
    text: {
      text, transform: [1, 0, 0, 1, centerX, baselineY], shapeType: 'point',
      style: { font: { name: 'ArialMT' }, fontSize, fillColor: { r: 0, g: 0, b: 0 } },
      paragraphStyle: { justification: 'center' },
    },
  };
}

// Foto entera, escalada para cubrir el marco, recortada por él
async function photoLayer(file, frame) {
  const meta = await sharp(file).rotate().metadata();
  const scale = Math.max(frame.width / meta.width, frame.height / meta.height);
  const width = Math.ceil(meta.width * scale);
  const height = Math.ceil(meta.height * scale);
  const data = await sharp(file).rotate().resize(width, height).ensureAlpha().raw().toBuffer();
  const left = frame.left + Math.round((frame.width - width) / 2);
  const top = frame.top + Math.round((frame.height - height) / 2);
  return {
    name: 'Foto', clipping: true, top, left, bottom: top + height, right: left + width,
    imageData: { width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) },
  };
}

// Documento: children[0] es la capa de abajo
const psd = {
  width, height, channels: 3, bitsPerChannel: 8, colorMode: 3,
  imageData: { width, height, data: compuestaRGBA },
  imageResources: {
    resolutionInfo: {
      horizontalResolution: 300, horizontalResolutionUnit: 'PPI', widthUnit: 'Centimeters',
      verticalResolution: 300, verticalResolutionUnit: 'PPI', heightUnit: 'Centimeters',
    },
    gridAndGuidesInformation: { guides: [{ location: x, direction: 'vertical' }] },
  },
  children: [
    { name: 'Fondo', opened: false, children: [...] },
    { name: 'Alumnado', opened: true, children: personas.slice().reverse() },
    { name: 'Cabecera', opened: true, children: [...] },
  ],
};
const buffer = writePsdBuffer(psd, { trimImageData: false });

// Leer solo estructura y metadatos (instantáneo, sin canvas)
const info = readPsd(fs.readFileSync(ruta), {
  skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
});

// Leer píxeles sin node-canvas: basta con un createImageData propio
initializeCanvas(
  () => { throw new Error('no canvas'); },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
);
```

Carpeta de persona: `{ name: '03 · Núñez Ávila, Lucía', opened: false,
layerColor: 'yellow', children: [marco, foto, nombre] }`. Compuesta con
`sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
.composite([...fotos, { input: svgConTextos, left: 0, top: 0 }]).ensureAlpha().raw()`.
