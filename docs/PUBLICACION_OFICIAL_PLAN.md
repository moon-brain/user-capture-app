# Plan: publicación oficial de fotografías

Cómo sigue la aplicación una foto desde que alguien pide su publicación oficial
hasta que está en el programa de gestión del centro (ITACA en la Comunitat
Valenciana, Séneca en Andalucía, Raíces en Madrid...), **sin saber nada de ese
programa**.

Escrito el 2026-11-04. Sustituye a la parte de la aplicación del plan de
publicación en ITACA, que preveía un rol «publicador» dentro de la aplicación
con Playwright. Ese rol sale de la aplicación (sección 8).

---

## 1. Contexto

- La aplicación ya permite **Solicitar publicación oficial**: copia la foto del
  depósito a `To-Publish/<id>.jpg` (NIA del alumnado, documento del personal),
  con la fecha de la solicitud. La lista lo marca con un icono y hay un filtro
  **Ver > Publicaciones solicitadas**.
- Nada marca la solicitud como hecha. Hoy alguien sube la foto a mano al
  programa de gestión y retira el archivo de `To-Publish`.
- En la Comunitat Valenciana ya hay un programa aparte que sube las fotos a
  ITACA automáticamente. Se probó con el curso 2026-27: 778 fotos de alumnado en
  una tarde. Es específico de ITACA y no puede ir en la aplicación, porque:
  - solo sirve a una comunidad;
  - se rompe cuando cambia la web de la Conselleria;
  - necesita un navegador controlado a distancia;
  - el repositorio es público.
- Los carnets ya funcionan así: la aplicación deja `To-Print-ID/<id>`, otro
  programa los imprime y la solicitud pasa a `Printed-ID/<id>`.

## 2. Objetivo

Definir un **protocolo de carpetas en el depósito** entre la aplicación y
cualquier **publicador**. Un publicador es un programa externo, o una persona,
que lleva las fotos al programa de gestión. Con ese protocolo:

1. La aplicación pide publicaciones y enseña el estado de cada persona:
   solicitada, publicada, fallida con su motivo, o con una foto más reciente
   que la publicada.
2. Cada comunidad puede escribir su publicador sin tocar la aplicación.
3. Un centro sin publicador automático puede hacer lo mismo a mano.

## 3. Principios

- **La aplicación no conoce ningún programa de gestión.** Ni URL, ni
  credenciales, ni selectores, ni niveles educativos de una comunidad. El
  nombre del sistema solo aparece como texto que escribe el publicador.
- **Una solicitud es una persona.** La carpeta `To-Publish` es la cola.
- **La foto viaja con la solicitud.** La copia de `To-Publish` son los bytes
  que se pidieron.
- **Compatibilidad hacia atrás:**
  - las versiones hasta la 1.26 leen todo archivo suelto de `To-Publish` como
    solicitud y se saltan las subcarpetas, así que todo lo nuevo va en
    subcarpetas;
  - una solicitud sin datos (versión antigua) sigue siendo válida;
  - un depósito sin `Published/` es un centro sin publicador.
- **Cada archivo tiene un solo escritor.** Los solicitantes escriben la
  solicitud; el publicador escribe el resultado.
- **Nada se borra por iniciativa de la aplicación**, como en el resto del
  depósito. Lo único que hace es retirar el error al volver a solicitar.
- **Sin datos personales en lo que se escribe**: identificador, tipo, código de
  grupo, fechas, hash y motivos. Ni nombres ni fotos nuevas.
- **JSON escritos con nombre temporal y renombrados**, para no leer nunca uno a
  medias.

## 4. Protocolo (versión 1)

### 4.1 Carpetas

```
<depósito>/
  <id>.jpg                    # foto oficial, como hasta ahora
  To-Publish/
    <id>.jpg                  # solicitud (ya existe)
    Datos/<id>.json           # datos de la solicitud (nuevo, solicitante)
    Errores/<id>.json         # último fallo (nuevo, publicador)
    Archivadas/               # ya existe: solicitudes retiradas
  Published/
    <id>.jpg                  # última foto publicada
    <id>.json                 # cuándo, quién y con qué sistema
    publicador.json           # último paso del publicador (opcional)
```

Las versiones anteriores solo leen los `.jpg` del primer nivel del depósito y
los archivos sueltos de `To-Publish`, así que ninguna de estas carpetas les
afecta.

### 4.2 Archivos

**`To-Publish/Datos/<id>.json`** lo escribe el solicitante **antes** de la foto:

```json
{
  "version": 1,
  "type": "student",
  "groupCode": "1ESOA",
  "requestedAt": "2026-11-04T10:15:00+01:00",
  "requestedBy": "secretaria"
}
```

- `type` es `student` o `staff`.
- `groupCode` es el código del XML del centro y no lleva en el personal.
- `requestedBy` es el nombre del equipo saneado, como en `Reemplazadas`.
- Al volver a solicitar, el archivo se sobrescribe.
- **Puede faltar**: Drive no garantiza el orden de subida, y las versiones
  antiguas no lo escriben. El publicador decide qué hacer sin él: deducir el
  tipo por la forma del identificador o dejarlo con el error
  `missing_request_data`.

**`Published/<id>.json`** lo escribe el publicador al terminar bien:

```json
{
  "version": 1,
  "publishedAt": "2026-11-04T10:16:12+01:00",
  "publishedBy": "jefatura",
  "system": "ITACA",
  "sha256": "…"
}
```

**`To-Publish/Errores/<id>.json`** lo escribe el publicador al fallar:

```json
{
  "version": 1,
  "reason": "not_found",
  "detail": "No está en ningún listado de matrícula",
  "failedAt": "…",
  "attempts": 1,
  "system": "ITACA"
}
```

- `reason` es uno de:
  - `not_found` y `ambiguous`: la persona no está, o está más de una vez;
  - `rejected`: el programa de gestión no aceptó la foto;
  - `missing_request_data` y `unreadable_photo`: problemas de la solicitud;
  - `configuration`: falta un ajuste del publicador;
  - `session`: la sesión caducó a medias;
  - `unexpected`: cualquier otro fallo.

  Un motivo desconocido se trata como `unexpected`.
- `detail` es texto para la persona, sin datos personales. La aplicación lo
  muestra tal cual.

**`Published/publicador.json`** (opcional) lo reescribe el publicador al acabar
cada pasada, **como mucho una vez cada 5 minutos**, para no llenar Drive de
versiones:

```json
{ "version": 1, "system": "ITACA", "machine": "jefatura", "lastRunAt": "…", "pending": 3 }
```

Los campos que la aplicación no conozca se ignoran, en todos los archivos.

### 4.3 Reglas

**Solicitante:**
- Solicitar escribe `Datos/<id>.json`, luego `<id>.jpg`, y borra
  `Errores/<id>.json` si existía. Volver a solicitar es la forma de reintentar.
- Archivar una solicitud mueve a `Archivadas/` la foto **y** sus datos y error.

**Publicador:**
- Toma una solicitud cuando `<id>.jpg` existe, su tamaño no cambia entre dos
  pasadas y no hay `Errores/<id>.json`.
- Si sale bien: mueve `<id>.jpg` a `Published/<id>.jpg` (sobrescribiendo),
  escribe `Published/<id>.json` y borra `Datos/<id>.json`.
- Si falla: escribe `Errores/<id>.json` y deja la solicitud donde está.
- No toca la foto oficial de la raíz ni nada fuera de `To-Publish` y
  `Published`.

**A mano:** hacer de publicador es lo mismo. La aplicación lo ofrece con
**Marcar como publicadas** (5.3), que escribe `system: "manual"`.

## 5. Cambios en la aplicación

### 5.1 Solicitar (fase A1)

- **Solicitar publicación oficial** escribe `Datos/<id>.json` y borra el
  error, según 4.3. El tipo y el código de grupo ya los tiene.
- **Proyecto > Revisar solicitudes pendientes** archiva también los datos y el
  error de cada solicitud.
- `pendingRequests.js` lista `To-Publish` como hasta ahora, ignorando
  subcarpetas.

### 5.2 Estados (fase A2)

Se leen con la misma caché con TTL que las solicitudes. Si hay varios, va
primero el que esté más arriba:

1. **Publicación fallida**: hay `Errores/<id>.json`. Icono en rojo, con el
   `detail` en el tooltip.
2. **Publicación solicitada**: hay `To-Publish/<id>.jpg`, como hoy.
3. **Publicada**: hay `Published/<id>.json`. El tooltip dice la fecha y el
   sistema.
4. **Foto más reciente que la publicada**: es «publicada», pero la foto del
   depósito es posterior a `publishedAt`. Se compara por fecha de
   modificación, no por hash, para no leer el depósito entero.

Revisar solicitudes pendientes enseña también las fallidas, con su motivo,
para archivarlas o volver a solicitarlas. **Ver > Publicaciones solicitadas**
no cambia. Un filtro de fallidas, más adelante si hace falta.

### 5.3 Sin publicador automático (fase A3)

- **Marcar como publicadas**: en el menú contextual en modo selección y en
  Revisar solicitudes pendientes. Hace lo mismo que un publicador con éxito
  (4.3). Es el equivalente de marcar carnets como impresos.
- **Último paso del publicador**: si existe `Published/publicador.json`,
  Revisar solicitudes pendientes dice «Publicador (ITACA, jefatura): última
  pasada hace 2 horas, 3 pendientes». Si no existe, no dice nada.

### 5.4 Lo que no se hace

- Ni rol publicador, ni Playwright, ni navegador controlado, ni preferencias de
  un programa de gestión concreto.
- Ningún mapa de grupos a niveles: eso es conocimiento de cada programa de
  gestión y vive en su publicador.

## 6. Documentación

- **Manual** (`src/help/`): los estados nuevos, Marcar como publicadas, y qué
  significa cada motivo de fallo. Va en el mismo commit que cada fase.
- **`docs/PROTOCOLO_PUBLICACION.md`**: la sección 4 de este plan, como
  referencia para quien escriba un publicador. Lleva un ejemplo mínimo de
  publicador manual, que solo mueve archivos.

## 7. Fases

Cada una por su rama y pull request desde `main`, y cada una se puede publicar
por sí sola.

1. **A1, solicitud con datos.** 4.1, 4.2 y 5.1. Tests de `pendingRequests`:
   - los archivos de las subcarpetas no son solicitudes;
   - archivar se lleva los datos y el error;
   - una solicitud sin datos sigue apareciendo.

   Escribir el protocolo en `docs/PROTOCOLO_PUBLICACION.md`.
2. **A2, estados.** 5.2, con manual. Tests de prioridad de estados y de motivo
   desconocido.
3. **A3, publicación a mano y último paso.** 5.3, con manual.

El publicador de ITACA va por su lado (sección 8) y puede funcionar antes de
A1: trata todas las solicitudes como de una versión antigua.

## 8. Publicadores

- Un publicador es **un programa aparte**. No se instala con la aplicación ni
  vive en este repositorio.
- El de ITACA tiene su propio plan y su propio repositorio, privado, porque
  contiene el recorrido grabado de la web de la Conselleria.
- Para otra comunidad, basta con cumplir la sección 4.

## 9. Criterios de aceptación

- Una solicitud hecha con la 1.26 aparece como solicitada en la versión nueva,
  y al revés. Ninguna versión toma `Datos/` ni `Errores/` como solicitudes.
- Con un publicador simulado, que solo mueve archivos según 4.3:
  - una solicitud pasa a «publicada» en la lista;
  - un fallo aparece en rojo con su detalle;
  - volver a solicitar lo saca de fallidas.
- Exportar al depósito una foto más nueva que la publicada la marca como «foto
  más reciente».
- Marcar como publicadas a mano deja el depósito igual que el publicador
  simulado.

## 10. Decisiones tomadas

- El publicador es externo. La aplicación solo habla el protocolo de carpetas.
- Datos y errores en subcarpetas de `To-Publish`, por compatibilidad con las
  versiones que leen todo archivo suelto como solicitud.
- `Published/` en la raíz del depósito, como `Printed-ID/`.
- Estados por fecha de modificación, sin hashes en la aplicación.
- Sin rol, sin bloqueo: si hay dos publicadores, es cosa de quien los
  configura. Mover un archivo que ya no está es inocuo.
