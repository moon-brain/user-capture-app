# Exportaciones

Desde **Archivo > Exportar** sacas de la aplicación los datos y las fotos del proyecto: listados CSV para otros programas, carpetas de fotos y listados en PDF con las fotos de cada grupo o con quién no tiene foto. Todas las exportaciones necesitan un proyecto abierto y te piden la carpeta donde guardar el resultado.

El cuadro para elegir la carpeta se abre en la última carpeta a la que exportaste, sea cual sea la exportación, para que no tengas que buscarla cada vez. Si esa carpeta ya no existe, se abre en la carpeta más cercana por encima de ella. La aplicación lo recuerda aunque la cierres.

## Qué hay en el menú Exportar

| Entrada del menú | Qué genera |
|---|---|
| **Archivo CSV para Carnets del grupo seleccionado** (`Ctrl+E`) | El archivo `carnets.csv` para el programa de carnets |
| **Archivos para Edu Inventory Manager** | `Alumnado.csv`, `Personal.csv` y `Grupos.csv`, y si quieres las fotos del depósito |
| **Imágenes capturadas como ID** | Las fotos capturadas, con el NIA o el DNI como nombre de archivo |
| **Imágenes del depósito como ID** | Las fotos del depósito de imágenes, con el NIA o el DNI como nombre de archivo |
| **Imágenes capturadas como nombre y apellidos** | Las fotos capturadas, con los apellidos y el nombre como nombre de archivo |
| **Imágenes capturadas al depósito** | Las fotos capturadas, copiadas al depósito de imágenes |
| **Listado en PDF con fotografías por grupo** | Un PDF por grupo con la foto y el nombre de cada persona |
| **Listado en PDF de usuarios sin foto en el depósito** | El archivo `Usuarios_sin_foto_en_deposito_` seguido de la fecha y la hora, en PDF |
| **Listado en PDF de usuarios sin foto capturada** | El archivo `Usuarios_sin_foto_capturada_` seguido de la fecha y la hora, en PDF |
| **Estadísticas de fotografías por grupo en PDF** | El archivo `Estadisticas_fotografias_por_grupo_` seguido de la fecha y la hora, en PDF |

Los listados de quienes han pagado la orla de graduación están en el menú **Orla** (ver [Orla de graduación](orlas.md#el-menu-orla)).

Los nombres de los PDF terminan con la fecha y la hora en que se generaron, en la forma `AAAAMMDDHHMMSS`: por ejemplo, `Usuarios_sin_foto_capturada_20261005143012.pdf` es del 5 de octubre de 2026 a las 14:30:12. Así, un listado nuevo no sustituye a uno que ya hayas entregado.

Los archivos CSV, en cambio, se llaman siempre igual, porque los leen otros programas: si en la carpeta elegida ya hay uno con el mismo nombre, la exportación lo sustituye.

## Qué usuarios se exportan

El CSV para carnets, **Imágenes capturadas como ID**, **Imágenes del depósito como ID**, **Imágenes capturadas como nombre y apellidos**, **Imágenes capturadas al depósito** y los dos listados en PDF de usuarios sin foto empiezan preguntando a quién incluyen, en la ventana **Usuarios a exportar**. Según cómo tengas la pantalla, te ofrece hasta cuatro respuestas, cada una con el número de usuarios que abarca:

- **Los usuarios seleccionados**, si estás en modo selección y hay alguno marcado.
- **Lo que muestra la lista**, que aparece con el nombre de lo que la está filtrando: el grupo elegido, la búsqueda escrita o el filtro del menú **Ver** que tengas activo. Es la opción marcada de entrada.
- **Todo el grupo**, si un filtro del menú **Ver** está dejando fuera a parte del grupo elegido. Con texto en el buscador no aparece, porque la búsqueda deja el filtro de grupos en «Todos los grupos».
- **Todos los usuarios del proyecto**.

Solo aparecen las opciones que en ese momento significan algo distinto. Si no tienes selección ni filtros, las cuatro serían las mismas personas: entonces no se pregunta nada y la exportación sigue directa.

> **Consejo:** si lo que quieres exportar es un grupo entero, lo más cómodo sigue siendo elegirlo en el filtro de grupos; la ventana te lo ofrecerá ya marcado.

Si no hay ningún usuario que exportar, la aplicación te avisa y no exporta nada.

Dos exportaciones no usan esta ventana porque tienen la suya: **Edu Inventory Manager** pregunta entre todos los usuarios y el grupo seleccionado, y el **Listado en PDF con fotografías por grupo** pregunta entre todos los grupos y uno solo.

Las demás exportaciones (inventario, listado con fotografías y **Estadísticas de fotografías por grupo en PDF**) tienen su propio alcance, que se explica en cada apartado.

## Copiar el original o redimensionar

**Imágenes capturadas como ID**, **Imágenes capturadas como nombre y apellidos**, **Imágenes capturadas al depósito** y las fotos del inventario te dejan elegir cómo sale cada foto:

- **Copiar imagen original**: la foto sale tal cual. Solo se vuelve a guardar si la cámara la dejó marcada como girada, para ponerla derecha.
- **Redimensionar imágenes**: reduce las fotos con dos valores:
  - **Tamaño del cuadro (píxeles)**: la foto se reduce hasta caber en un cuadrado de ese lado (800 por defecto), sin deformarse. Las fotos más pequeñas no se amplían.
  - **Tamaño máximo de archivo (KB)**: la aplicación baja la calidad poco a poco hasta que la foto pesa menos de ese valor (500 por defecto). Hay una calidad mínima de la que no pasa, así que alguna foto puede quedar algo por encima.

La opción que sale marcada y los dos valores se pueden cambiar en **Archivo > Preferencias... > Exportación de imágenes** (ver [Exportación de imágenes](preferencias.md#exportacion-de-imagenes)). Lo que cambies en la ventana de una exportación vale solo para esa vez.

En las tres exportaciones de fotos capturadas, la ventana **Opciones de Exportación** muestra antes un resumen: **Se exportará** (qué usuarios entran, según la regla anterior), cuántas imágenes se enviarán y cuántos **Usuarios sin foto capturada** hay en ese conjunto. Revísalo antes de pulsar **Exportar**.

## Exportar el CSV para carnets

Genera `carnets.csv`, el listado que usa el programa de impresión de carnets.

1. Elige el grupo en el filtro de grupos, si vas a exportar uno.
2. Pulsa **Archivo > Exportar > Archivo CSV para Carnets del grupo seleccionado** o `Ctrl+E`.
3. Confirma a quién incluye en la ventana **Usuarios a exportar** (ver [Qué usuarios se exportan](#que-usuarios-se-exportan)).
4. Elige la carpeta donde guardarlo.
5. Si alguno de los usuarios exportados tenía una solicitud de carnet pendiente, la aplicación te pregunta si quieres marcarlos como impresos. Se explica en [Carnets y publicación oficial](carnets.md#marcar-los-carnets-como-impresos).
6. Un mensaje final indica cuántos usuarios se han exportado y cuántos se han ignorado.

> **Importante:** solo entran los usuarios que tienen foto en el depósito de imágenes, es decir, un archivo con su NIA o su DNI en la carpeta del depósito. Lo que cuenta es la foto del depósito, no la capturada: si acabas de hacer fotos nuevas, expórtalas antes al depósito. Los que no tienen foto allí aparecen como ignorados «sin imagen en el depósito».

El archivo usa punto y coma (`;`) como separador y tiene estas columnas, en este orden:

| Columna | Contenido |
|---|---|
| `id` | NIA para el alumnado; DNI (documento) para el personal |
| `password` | Lo mismo que `id` |
| `userlevel` | `Alumno` para el alumnado y `Profesor` para todo el personal, docente o no |
| `nombre` | Nombre |
| `apellido1` | Primer apellido |
| `apellido2` | Segundo apellido |
| `apellidos` | Los dos apellidos juntos |
| `centro` | Siempre `1` |
| `foto` | `NIA.jpg` para el alumnado y `DNI.jpg` para el personal |
| `grupo` | Nombre completo del grupo, por ejemplo `1º ESO A` (el código si el grupo ya no existe en el proyecto) |
| `direccion` | Vacía |
| `telefono` | Vacía |
| `departamento` | Siempre `1` |
| `DNI` | Documento de la persona, también del alumnado si lo tiene |
| `edad` | Para el alumnado, `mayor.jpg` si tiene 18 años el día de la exportación y `menor.jpg` si no; para el personal, `profesor.jpg` |
| `fechaNacimiento` | Fecha de nacimiento |
| `nombreApellidos` | Nombre y apellidos juntos |

## Exportar los archivos para Edu Inventory Manager

Genera los listados que importa Edu Inventory Manager y, si quieres, las fotos del depósito.

1. Si solo quieres un grupo, elígelo antes en el filtro de grupos.
2. Pulsa **Archivo > Exportar > Archivos para Edu Inventory Manager**.
3. En **Usuarios a exportar**, elige **Todos los usuarios** o **Grupo seleccionado** (el del filtro de grupos). Esta segunda opción no está disponible si no hay grupo elegido o si hay texto en el buscador. Si el grupo no tiene usuarios, la aplicación te avisa y no exporta nada.
4. Si quieres también las fotos, marca **Exportar imágenes del depósito** y elige **Copiar imagen original** o **Redimensionar imágenes** (ver [Copiar el original o redimensionar](#copiar-el-original-o-redimensionar)).
5. Si quieres las fotos comprimidas, marca **Comprimir imágenes en archivos ZIP** e indica el **Tamaño máximo por archivo ZIP (MB)** (25 por defecto).
6. Pulsa **Exportar** y elige la carpeta.
7. Un mensaje final resume los archivos creados, las imágenes exportadas y las que no tenían foto en el depósito.

Los tres listados usan la coma como separador:

| Archivo | Contenido |
|---|---|
| `Alumnado.csv` | Un alumno por fila: `Codigo` (el NIA), `Nombre`, `Apellido1`, `Apellido2`, `Fecha Nacimiento` y `Grupo` (código del grupo) |
| `Personal.csv` | Docentes y no docentes: `Función` (`Docente` o `No Docente`), `Documento`, `Nombre`, `Apellido1`, `Apellido2`, `Fecha Nacimiento`, `Teléfono 1`, `Teléfono 2` y `Email` (estas tres últimas, vacías) |
| `Grupos.csv` | `CódigoGrupo` y `Nombre` de cada grupo |

> **Importante:** `Grupos.csv` lleva siempre todos los grupos del proyecto, aunque exportes un solo grupo.

Sobre las fotos:

- Salen del depósito de imágenes, no de las capturadas. Solo se incluyen los usuarios que tienen foto en el depósito.
- Se llaman `NIA.jpg` o `DNI.jpg` y van todas juntas en la carpeta elegida, sin subcarpetas por grupo.
- Con la compresión activada, las fotos van dentro de `imagenes.zip`. Si no caben en el tamaño máximo, se reparten en varios archivos: `imagenes_1.zip`, `imagenes_2.zip`, etc. En la carpeta no quedan fotos sueltas ni la carpeta temporal por la que pasan, aunque no haya ninguna foto que exportar o la exportación falle a medias.

## Exportar imágenes capturadas como ID

Copia las fotos capturadas a una carpeta, nombradas con el identificador de cada persona.

1. Elige a quién exportar (ver [Qué usuarios se exportan](#que-usuarios-se-exportan)).
2. Pulsa **Archivo > Exportar > Imágenes capturadas como ID**.
3. Elige la carpeta de destino.
4. Revisa el resumen, elige **Copiar imagen original** o **Redimensionar imágenes** y pulsa **Exportar**.

Dentro de la carpeta elegida se crea una subcarpeta por grupo, con el código del grupo como nombre. Cada foto se llama `NIA.jpg` para el alumnado y `DNI.jpg` para el personal. Solo se exportan los usuarios con una foto capturada enlazada; se saltan los que no tienen NIA o DNI.

Al terminar, un mensaje resume cuántas fotos se han exportado y en cuántas carpetas de grupo, cuántos usuarios sin grupo se han quedado fuera y qué fotos no se han podido exportar (por ejemplo, porque falta el archivo o el usuario no tiene NIA ni DNI).

## Exportar imágenes del depósito como ID

Hace lo mismo que **Imágenes capturadas como ID**, pero con las fotos del [depósito de imágenes](deposito.md) en lugar de las capturadas en el proyecto. Sirve, por ejemplo, para sacar las fotos oficiales de un grupo aunque este curso no se les haya hecho foto.

1. Elige a quién exportar (ver [Qué usuarios se exportan](#que-usuarios-se-exportan)).
2. Pulsa **Archivo > Exportar > Imágenes del depósito como ID**.
3. Elige la carpeta de destino.
4. Revisa el resumen: cuántas fotos del depósito se van a exportar y cuántos usuarios no tienen foto en él. Elige **Copiar imagen original** o **Redimensionar imágenes** y pulsa **Exportar**.
5. Al terminar, un mensaje resume cuántas fotos se han exportado, cuántos usuarios no tenían foto en el depósito y los problemas que haya habido.

El resultado tiene la misma forma que **Imágenes capturadas como ID**: una subcarpeta por grupo, con el código del grupo como nombre, y cada foto llamada `NIA.jpg` para el alumnado y `DNI.jpg` para el personal. Da igual que la persona tenga o no una foto capturada: solo cuenta la del depósito.

- Necesita el depósito configurado en **Proyecto > Configurar depósito de imágenes**.
- No depende de las opciones del depósito del menú **Ver**: la aplicación busca las fotos directamente en el depósito.
- Si la copia local del depósito está al día, lee las fotos de ella, que es más rápido; si no, las lee del depósito.
- Si la selección o los filtros no dejan ningún usuario, o ninguno tiene foto en el depósito, la aplicación te avisa y no exporta nada.

## Exportar imágenes capturadas como nombre y apellidos

Igual que la anterior, pero cada foto se llama con los apellidos y el nombre de la persona, con la primera letra de cada palabra en mayúscula: `Apellido1 Apellido2, Nombre.jpg`, por ejemplo `García López, Ana María.jpg`.

1. Elige a quién exportar (ver [Qué usuarios se exportan](#que-usuarios-se-exportan)).
2. Pulsa **Archivo > Exportar > Imágenes capturadas como nombre y apellidos**.
3. Elige la carpeta de destino.
4. Revisa el resumen, elige **Copiar imagen original** o **Redimensionar imágenes** y pulsa **Exportar**.

Las fotos también se reparten en una subcarpeta por grupo, y al terminar se muestra el mismo resumen.

> **Importante:** si dos personas del mismo grupo se llaman exactamente igual, sus fotos tendrían el mismo nombre de archivo y la segunda sustituiría a la primera. En ese caso, usa **Imágenes capturadas como ID**.

## Exportar imágenes capturadas al depósito

**Archivo > Exportar > Imágenes capturadas al depósito** copia las fotos capturadas de los usuarios a exportar (ver [Qué usuarios se exportan](#que-usuarios-se-exportan)) a la carpeta del depósito de imágenes, con el NIA o el DNI como nombre, y sustituye las que ya hubiera. Al terminar, te ofrece desvincular las fotos de los usuarios exportados para empezar una nueva ronda. El proceso completo, incluido qué pasa con las fotos sustituidas y cómo deshacer la desvinculación, está en [Depósito de imágenes](deposito.md).

## Exportar el listado con fotografías por grupo

Sirve para que el equipo directivo y el profesorado pongan cara a cada nombre: un PDF por grupo con la foto y el nombre de todas sus personas. No es la orla de graduación, que se explica en [Orla de graduación](orlas.md).

1. Pulsa **Archivo > Exportar > Listado en PDF con fotografías por grupo**.
2. En la ventana **Listado en PDF con fotografías por grupo**, elige:
   - **Grupos a exportar**: **Todos los grupos** o **Un solo grupo**, que eliges en la lista de debajo.
   - **Tipo de fotografías a incluir**: **Fotografías capturadas** (las enlazadas en este proyecto) o **Fotografías del depósito**.
   - **Calidad JPEG**: **Baja (60)**, **Alta (80)**, que es la recomendada, **Muy Alta (90)** o **Máxima (100)**. A más calidad, PDF más pesado.
3. Pulsa **Exportar** y elige la carpeta donde guardar los PDF.
4. Un mensaje final indica cuántos archivos PDF se han generado.

Cada listado incluye a todas las personas del grupo, tengan foto o no. No depende de la búsqueda, del filtro de grupos ni de la selección de la lista.

Así es cada listado:

- Un archivo por grupo, llamado `Listado_fotos_` seguido del código del grupo y de la fecha y la hora; por ejemplo, `Listado_fotos_1ESO-A_20261005143012.pdf`. Todos los archivos de una misma exportación llevan la misma fecha y hora.
- Páginas A4 en vertical. La primera lleva el título «Listado con fotografías -» seguido del código del grupo.
- Seis fotos por fila y hasta seis filas por página. Si el grupo no cabe, sigue en páginas nuevas.
- Las personas van por orden alfabético: primer apellido, segundo apellido y nombre.
- Las fotos se recortan a formato retrato vertical, así que pueden perder algo de los bordes.
- Debajo de cada foto aparece «Apellido1 Apellido2, Nombre» en letra pequeña. Los nombres que no caben se cortan con puntos suspensivos.
- Quien no tiene foto aparece con un recuadro gris y una silueta.
- Si has elegido un logotipo en las preferencias, aparece arriba a la izquierda de cada página. Ver [Preferencias y actualizaciones](preferencias.md).

## Exportar los listados de usuarios sin foto

Sirven para saber a quién le falta todavía la foto y poder avisarle, por ejemplo entregando a cada tutor la lista de su grupo:

- **Archivo > Exportar > Listado en PDF de usuarios sin foto en el depósito** busca a cada usuario en el depósito de imágenes por su NIA o su DNI, como hacen las exportaciones. Hace falta tener configurado el depósito en **Proyecto > Configurar depósito de imágenes**.
- **Archivo > Exportar > Listado en PDF de usuarios sin foto capturada** lista a quienes no tienen una foto capturada enlazada en este proyecto.

Los dos empiezan preguntando a quién incluyen (ver [Qué usuarios se exportan](#que-usuarios-se-exportan)). La primera página resume cuántos usuarios hay en cada grupo y cuántos no tienen foto. Después, cada grupo con alguien pendiente empieza en una página nueva, con sus usuarios ordenados por apellidos y su NIA o DNI. Los usuarios del grupo **Eliminados** no aparecen.

Si todos los usuarios tienen foto, la aplicación te lo dice y no genera ningún archivo.

## Exportar las estadísticas de fotografías por grupo

**Archivo > Exportar > Estadísticas de fotografías por grupo en PDF** no incluye fotos: pone en papel las mismas cifras que la ventana [Fotografías por grupo](enlazar.md#fotografias-por-grupo), en una tabla con todos los grupos del proyecto, cuántos usuarios tiene cada uno y cuántos tienen foto capturada y foto en el depósito, con el porcentaje coloreado de rojo a verde y los totales al final.

Siempre abarca el proyecto entero, sin tener en cuenta la búsqueda, los filtros ni la selección. Si el depósito no está configurado o su carpeta no está disponible, el PDF sale solo con las fotos capturadas y te avisa de por qué.
