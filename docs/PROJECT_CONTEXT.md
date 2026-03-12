# 5) ESolutions API Documentation v4.1 (public)

## Introducción

La **API de integración del Banco Nacional de Crédito** está diseñada para proporcionar una experiencia de consulta y operación intuitiva y eficiente, permitiendo a los usuarios obtener rápidamente la información financiera que necesitan y ejecutar operaciones electrónicas de pago.

Está construida sobre **tecnología REST**, utilizando JSON como formato de intercambio y peticiones HTTP **POST** en todos los endpoints.

### Características clave

- Acceso en tiempo real a datos financieros.
- Facilidad de uso para desarrolladores.
- Flexibilidad para integrarse en distintas plataformas.
- Soporte para:
  - Pagos P2P (persona a persona).
  - Pagos C2P (comercio a persona).
  - VPOS (punto de venta virtual).
  - Consultas (saldo, historial, tasas, bancos, etc.).
  - Crédito y débito inmediato.

La API cumple con estándares de seguridad del sector financiero y está pensada para ser usada por empresas y desarrolladores que deseen crear soluciones de pago electrónico avanzadas.

## Objetivo

Proveer una **documentación clara y concisa** sobre el uso de la API, incluyendo:

- Aspectos técnicos.
- Parámetros requeridos.
- Ejemplos de peticiones y respuestas.

De esta manera se facilita la integración y el uso efectivo de la API en aplicaciones de pago electrónico.

## Aspectos generales

- **Nombre**: API de integración del Banco Nacional de Crédito (Interfaz de Pagos Electrónicos).
- **Tecnología**: REST.
- **Versión documentada**: v2.1.
- **Fecha de referencia de la documentación**: 26/08/2024.
- **Endpoint ambiente de calidad (QA)**:  
  `https://servicios.bncenlinea.com:16500/api`
- **URL de verificación de conexión**:  
  `https://servicios.bncenlinea.com:16500/api/welcome/home`

---

## Cómo hacer una invocación a la API

Para poder hacer peticiones a la API es necesario tener en cuenta los siguientes aspectos:

- Al iniciar la operatividad con la Interfaz de Pagos Electrónicos, el banco asigna al cliente:
  - Un **ClientGUID** (credencial de usuario).
  - Una **MasterKey** (llave maestra).
- Con estas credenciales se realiza la **petición de autenticación (Logon)**.  
  Si la autenticación es exitosa, la respuesta incluye un **WorkingKey** (llave de trabajo).
- El **WorkingKey** se utiliza para encriptar todas las demás operaciones durante el día y **vence a medianoche (12:00 a.m.)**.
- Cada día se debe realizar una nueva autenticación para obtener un WorkingKey válido.

### Importante: Refresh Working Key (RWK)

El banco puede adelantar el vencimiento del WorkingKey por motivos de seguridad.  
En ese caso, el mensaje de respuesta incluye un código especial:

- **RWK** → “Refresh Working Key”.

Si aparece este código, se debe:

1. Invocar de nuevo el método de autenticación.
2. Obtener un nuevo WorkingKey.
3. Reintentar la operación con la nueva llave.

---

## Forma del Request

- Todas las peticiones utilizan `Content-Type: application/json`.
- **Todas las operaciones son POST**.
- La estructura del request “envoltorio” es siempre la misma:

```json
{
  "ClientGUID": "4A074C46-DD4E-4E54-8010-B80A6A8758F4",
  "Reference": "MiIdentificadorAlfanumericoUnicoEnElDia",
  "Value": "V+aTwhmz9NrCwyFFb6w52Lw+CDFZBqpB3lyCzWIxsVFsnx2ShTrB3rPqR4d+egRNirfBjm6tAuys4ziO5XItfVNlPtYeyjKOUPAdtgxDnVSjNjJxySIIeLhkBXjPZ2dvIYsB8v3I8qEoWhIx+EAalQ==",
  "Validation": "fb8443f34045bdba97a174776205f7fee4e8dd59ccf15cc915d5bf2d2c61841b",
  "swTestOperation": false
}
```

### Campos del request

- **ClientGUID (string)**  
  Identificador único global de 36 caracteres asignado por el banco.  
  Se usa para autenticar al cliente en todas las peticiones.

- **Reference (string)**  
  Identificador único de la transacción **durante el día**.  
  El cliente lo elige y el banco lo utiliza para:
  - Marcar movimientos.
  - Identificar la transacción.
  - Evitar duplicados.

- **Value (string)**  
  Contiene el **request interno de la operación** (el objeto JSON con los parámetros de negocio) encriptado en **AES (Rijndael)**.

  Flujo:

  1. Definir el JSON de la operación (por ejemplo, Logon).
  2. Serializarlo a texto.
  3. Encriptar en AES (usando MasterKey o WorkingKey, según el caso).
  4. El resultado en Base64 se envía en `Value`.

- **Validation (string)**  
  Hash **SHA256** del **request interno sin encriptar** (el mismo JSON que se encripta para `Value`).

- **swTestOperation (bool)**  
  - `true`: solo valida la petición (no procesa la transacción).
  - `false`: procesa la operación de forma real (valor recomendado incluso en QA para pruebas funcionales).

### Ejemplo de Logon (request interno)

Request que se desea encriptar:

```json
{
  "ClientGUID": "4A074C46-DD4E-4E54-8010-B80A6A8758F4"
}
```

El resultado de encriptar con la MasterKey será un texto similar a:

```text
V+aTwhmz9NrCwyFFb6w52Lw+CDFZBqpB3lyCzWIxsVFsnx2ShTrB3rPqR4d+egRNirfBjm6tAuys4ziO5XItfVNlPtYeyjKOUPAdtgxDnVSjNjJxySIIeLhkBXjPZ2dvIYsB8v3I8qEoWhIx+EAalQ==
```

Ese es el valor que debe enviarse en el campo **Value** del request principal.

> **Nota**:  
> - El servicio de **Logon** se encripta con la **MasterKey**.  
> - El resto de los servicios se encriptan con el **WorkingKey** obtenido en la respuesta del Logon.

---

## Estructura de la Respuesta

Todas las respuestas siguen el mismo patrón:

```json
{
  "status": "OK",
  "message": "000000Se ha iniciado sesión exitosamente.",
  "value": "Yci8FE7upBe9uI3WHPfg8sXsNCkAYwkKUDSyWKGq6R0AkiURhY4DW1coQ4ttu3aE6V4OWUPCaY0O9lBxTHJ1fTeotJOz3JNc4nIeDcCwL6B2skc2vyrbd+c6/zUg0teYSYuaJII4+eNuO2eTjXAluw==",
  "validation": "c2ab5bfeed32b81a1be0e21e89c02374ea2987e3c2a351e6a4044dce3885ca58"
}
```

### Campos de la respuesta

- **status (string)**  
  - `"OK"` → operación exitosa.  
  - `"KO"` → operación fallida.

- **message (string)**  
  Código de 6 caracteres + mensaje libre.  
  Ejemplo: `"000000Se ha iniciado sesión exitosamente."`.

- **value (string)**  
  Contiene el resultado **encriptado** en AES (mismo esquema de Value del request).

- **validation (string)**  
  Hash SHA256 del objeto de respuesta sin encriptar.

Para obtener el contenido real de `value` es necesario **desencriptar usando la misma clave (MasterKey o WorkingKey) que se usó durante la petición**.

---

## ChildClientID y BranchID

La API permite modelar la estructura:

- **Cuenta principal (Padre)**.
- **Asociados (Hijos)**.
- **Sucursales de asociados (Nietos / Sedes)**.

### Ejemplos

Supongamos que todos comparten el mismo `ClientGUID` de ejemplo:

```text
4A074C46-DD4E-4E54-8010-B80A6A9058H4
```

- **Cuenta Padre**  
  - Solo usa `ClientGUID`.

- **Cuenta Hijo (asociado)**  
  - Usa `ClientGUID`.  
  - Incluye `ChildClientID` (ejemplo: `"J00000000"`).

- **Cuenta Nieto (sede de hijo)**  
  - Usa `ClientGUID`.  
  - Incluye `ChildClientID` (ejemplo: `"J00000000"`).  
  - Incluye `BranchID` (ejemplo: `"CS400"`).

### Resumen

- **Padre**: solo `ClientGUID`.
- **Hijo**: `ClientGUID` + `ChildClientID`.
- **Nieto (sede)**: `ClientGUID` + `ChildClientID` + `BranchID`.

> La cuenta Padre es la responsable de generar diariamente el **WorkingKey** con el servicio de autenticación.  
> Los asociados (Hijo/Nieto) operan usando ese mismo WorkingKey.

### Ejemplos de P2P según nivel

**Transacción de la cuenta principal (Padre):**

```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584200000000",
  "BeneficiaryEmail": "",
  "BeneficiaryID": "V00000000",
  "BeneficiaryName": "Ejemplo Padre",
  "Description": "EjemploPadre",
  "OperationRef": "REFPADRE001"
}
```

**Transacción de un asociado (Hijo):**

```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584200000000",
  "BeneficiaryEmail": "",
  "BeneficiaryID": "V00000000",
  "BeneficiaryName": "Ejemplo Hijo",
  "Description": "EjemploHijo",
  "OperationRef": "REFHIJO001",
  "ChildClientID": "J00000000"
}
```

**Transacción de una sede de asociado (Nieto):**

```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584200000000",
  "BeneficiaryEmail": "",
  "BeneficiaryID": "V00000000",
  "BeneficiaryName": "Ejemplo Nieto",
  "Description": "EjemploNieto",
  "OperationRef": "REFNIETO001",
  "ChildClientID": "J00000000",
  "BranchID": "CS400"
}
```

---

## Uso en Postman

### Importar la colección

1. Ir a la documentación pública del API en Postman (link que provee el banco).
2. Hacer clic en **“Run in Postman”**.
3. Elegir el entorno (recomendado Postman para Windows).
4. Importar la colección.

### Configurar variables en Postman

1. Dentro de Postman, en la esquina superior derecha de la colección, hacer clic en **“Variables”**.
2. Completar al menos:
   - `ClientGUID`
   - `MasterKey`
   - `urlbase` (por ejemplo: `https://servicios.bncenlinea.com:16500/api`)

Con esto, la colección puede:

- Construir automáticamente el **Value**.
- Construir el **Validation**.
- Enviar el objeto final hacia el API.

### Scripts de encriptación en la colección

La colección incluye scripts en la pestaña **Scripts**:

- En **Pre-request**:  
  - Encripta el body legible en AES.
  - Genera el `Validation` (SHA256).
  - Construye el request final (envoltorio).

- En **Tests**:  
  - Muestra el request final enviado.  
  - Muestra la respuesta.  
  - Desencripta `value` para ver el resultado real.

> Importante:  
> El body que se ve en la pestaña **Body** (legible) **no es** lo que se envía realmente.  
> El objeto real enviado se puede ver en la pestaña **Tests** o **Test Results**.

---

## La encriptación

### Descripción general

El BNC utiliza encriptación basada en:

- **AES** (Rijndael) para `Value`.
- **SHA256** para `Validation`.
- **PBKDF2 con SHA1 y 1000 iteraciones** para derivar:
  - La **key** de 32 bytes.
  - El **IV** de 16 bytes.
- Texto en **UTF-16LE** antes de encriptar.

Ejemplo en JavaScript (usando CryptoJS):

```javascript
class DataCypher {
  constructor(encryptionKey) {
    const saltBytes = this.byte([
      0x49, 0x76, 0x61, 0x6e,
      0x20, 0x4d, 0x65, 0x64,
      0x76, 0x65, 0x64, 0x65,
      0x76
    ]);

    const salt = CryptoJS.enc.Hex.parse(saltBytes);

    const keyAndIv = CryptoJS.PBKDF2(encryptionKey, salt, {
      keySize: 48 / 4,
      iterations: 1000,
      hasher: CryptoJS.algo.SHA1
    });

    this.key = CryptoJS.lib.WordArray.create(keyAndIv.words.slice(0, 8), 32);
    this.iv = CryptoJS.lib.WordArray.create(keyAndIv.words.slice(8, 12), 16);
  }

  byte(arr) {
    return arr.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  encryptAES(text) {
    const textWordArray = CryptoJS.enc.Utf16LE.parse(text);
    const encrypted = CryptoJS.AES.encrypt(textWordArray, this.key, {
      iv: this.iv,
    });
    return encrypted.toString();
  }

  decryptAES(text) {
    const decrypted = CryptoJS.AES.decrypt(text, this.key, {
      iv: this.iv,
    });
    return decrypted.toString(CryptoJS.enc.Utf16LE);
  }

  encryptSHA256(requestData) {
    const hash = CryptoJS.SHA256(requestData);
    return hash.toString(CryptoJS.enc.Hex);
  }
}
```

### Resumen de elementos criptográficos

- **encryptionKey**:  
  - Para Logon: MasterKey.  
  - Para el resto: WorkingKey.

- **salt**: array de bytes constante para reforzar la derivación.

- **PBKDF2**:
  - 1000 iteraciones.
  - SHA1 como hasher.
  - Produce 48 bytes → 32 bytes de key + 16 bytes de IV.

- **key**: clave AES de 256 bits.
- **iv**: vector de inicialización de 128 bits.

> El equipo de Soluciones en Línea del banco puede proveer implementaciones en distintos lenguajes (Java, C#, PHP, Node, etc.).

---

## Códigos y mensajes de error (extracto)

### Pago Móvil (P2P / C2P)

Algunos códigos relevantes:

- **G05, G12, G91, G96**: problemas de comunicación, reintentar.
- **G14, G41, G43, G52**: beneficiario no afiliado a Pago Móvil.
- **G51**: fondos insuficientes.
- **G61**: excede límite de montos diarios.
- **G65**: excede cantidad de transacciones diarias.
- **G80**: cédula inválida del beneficiario.
- **G62**: beneficiario restringido.

### VPOS

Ejemplos:

- **G00, G10, G11, G16**: aprobado.
- **G51**: fondo insuficiente.
- **G55**: PIN inválido.
- **G96**: mal funcionamiento del sistema.
- **CO1**: comercio no existe.

### Generales

Ejemplos:

- **EPIRWK**: petición denegada, se debe refrescar WorkingKey.
- **EPIHV**: hash de la petición inválido (Validation incorrecto).
- **EPIIMS**: el modelo no cumple validaciones.
- **EPICNF**: cliente no encontrado o inactivo.
- **EPIONA**: sin permisos para la operación.

### Créditos / Débitos inmediatos (códigos ISO)

Ejemplos:

- **ACCP**: operación aceptada.
- **AC00**: operación en espera de respuesta.
- **AM04**: saldo insuficiente.
- **AM05**: operación duplicada.
- **AC01**: número de cuenta incorrecto.
- **AB01**: tiempo de espera agotado.
- **RJCT**: operación rechazada.

---

## Servicios de Consultas (extracto)

### Consultar saldo – `POST /Position/Current`

**Body (request interno, sin encriptar):**

```json
{
  "ClientID": "J000000000",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Respuesta desencriptada (ejemplo):**

```json
{
  "01910001462101002924": { "CurrencyCode": "VES", "Balance": 0.0 },
  "01910095202195016021": { "CurrencyCode": "VES", "Balance": 92832.83 },
  "01910095232395000411": { "CurrencyCode": "USD", "Balance": 0.0 }
}
```

---

### Historial últimos 3 días – `POST /Position/History`

**Body (request interno, sin encriptar):**

```json
{
  "ClientID": "J000000000",
  "AccountNumber": "01910000000000000000",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Respuesta desencriptada (ejemplo):**

```json
[
  {
    "Date": "02/08/2024",
    "ControlNumber": "170036806",
    "Amount": 1185.82,
    "Code": "387",
    "BankCode": "0191",
    "DebtorInstrument": "01910000000000000000",
    "Concept": "PRUEBA BNC",
    "Type": "C2P Pago Movil BNC C2PPAG",
    "BalanceDelta": "Egreso",
    "ReferenceA": "14894",
    "ReferenceB": "584200000000",
    "ReferenceC": "584200000000",
    "ReferenceD": "36802"
  }
]
```

---

### Historial por fecha – `POST /Position/HistoryByDate`

**Body (request interno, sin encriptar):**

```json
{
  "ClientID": "J000000000",
  "AccountNumber": "01910000000000000000",
  "StartDate": "2024-08-01T00:00:00",
  "EndDate": "2024-08-02T00:00:00",
  "ChildClientID": "",
  "BranchID": ""
}
```

La respuesta es similar a `Position/History`, con la lista de movimientos del rango solicitado.

---

### Tasa BCV del día – `POST /Services/BCVRates`

**Body (request interno, sin encriptar):**

```json
{}
```

**Respuesta desencriptada (ejemplo):**

```json
{
  "PriceRateBCV": 36.6642,
  "dtRate": "07/08/2024"
}
```

---

## Notas finales

- Nunca expongas tu **ClientGUID**, **MasterKey**, **WorkingKey**, **ClientID real**, **afiliaciones**, **terminales** ni otros datos sensibles en repositorios públicos.
- En esta documentación deben usarse **ejemplos ficticios** que no coincidan con credenciales reales.
- Para integración real, utiliza:
  - Variables de entorno (`.env`) en tu backend.
  - Variables de colección/entorno en Postman.

Con esta guía puedes:

- Entender la forma general de requests y respuestas.
- Implementar la encriptación y desencriptación.
- Probar los servicios principales: autenticación, P2P, C2P, VPOS, consultas, validaciones, créditos y débitos inmediatos.

