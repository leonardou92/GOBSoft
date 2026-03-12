Claro, aquí tienes la documentación formateada en Markdown:

# 5) ESolutions API Documentation v4.1 (public)

**ENVIRONMENT:** No Environment
**LAYOUT:** Double Column
**LANGUAGE:** PHP - cURL

---

## Índice Rápido

- [Introducción](#5-esolutions-api-documentation-v41-public)
    - [Importante](#importante)
    - [En Postman](#en-postman)
    - [La encriptación](#la-encriptación)
    - [Códigos y mensajes de error](#códigos-y-mensajes-de-error)
- [Servicios](#servicios)
    - [Autenticacíon](#autenticacíon)
        - [POST: Logon](#post-logon)
    - [P2P](#p2p)
        - [POST: Generar un pago P2P](#post-generar-un-pago-p2p)
        - [POST: Generar QR P2P](#post-generar-qr-p2p)
    - [C2P](#c2p)
        - [POST: Validar Operaciones con Referencia](#post-validar-operaciones-con-referencia)
        - [POST: Validar Operaciones sin Referencia](#post-validar-operaciones-sin-referencia)
    - [VPOS](#vpos)
    - [Consultas](#consultas)
        - [POST: Consultar Saldo](#post-consultar-saldo)
        - [POST: Historial (Ultimos 3 Dias)](#post-historial-ultimos-3-dias)
        - [POST: Historial por fecha (máx 31 días)](#post-historial-por-fecha-máx-31-días)
        - [POST: Tasa BCV del Dia](#post-tasa-bcv-del-dia)
        - [POST: Lista de Bancos Disponibles](#post-lista-de-bancos-disponibles)
        - [POST: Consulta de Operaciones POS Fisicos](#post-consulta-de-operaciones-pos-fisicos)
        - [POST: Consultar Saldo Data completa](#post-consultar-saldo-data-completa)
        - [POST: Historial Por Numero de Control (Fecha Actual)](#post-historial-por-numero-de-control-fecha-actual)
        - [POST: Historial diario (Dias Anteriores)](#post-historial-diario-dias-anteriores)
- [Validaciones](#validaciones)
    - [Gestor de Asociados](#gestor-de-asociados)
    - [Crédito inmediato (Pagar)](#crédito-inmediato-pagar)
    - [Debito inmediato (Cobrar)](#debito-inmediato-cobrar)

---

# 5) ESolutions API Documentation v4.1 (public)

API de integración del **Banco Nacional de Crédito**.

El API de integración del Banco Nacional de Crédito está diseñado para proporcionar una experiencia de consulta intuitiva y eficiente, permitiendo a los usuarios obtener rápidamente la información financiera que necesitan. Esta API ha sido desarrollada utilizando tecnología **REST**, asegurando un enfoque moderno y eficiente para la gestión de transacciones electrónicas.

Algunas de las características clave incluyen:

*   Acceso en tiempo real a los datos financieros más recientes.
*   Facilidad de uso para desarrolladores y programadores.
*   Flexibilidad para integrar en diferentes plataformas y aplicaciones.
*   Oportunidad de realizar pagos, como P2P (persona a persona), C2P (comercio a persona), puntos de venta virtuales, transferencias interbancarias, entre otros.

Este API se compromete con la innovación constante y el cumplimiento de las normativas regulatorias más estrictas del sector financiero. Ofrece una solución versátil y confiable para acceder a una amplia gama de servicios financieros, permitiendo así que las empresas y desarrolladores creen aplicaciones y herramientas financieras avanzadas.

## Objetivo

El objetivo de esta documentación es proporcionar información clara y concisa sobre el uso de la API, incluyendo aspectos técnicos, parámetros requeridos y ejemplos de peticiones y respuestas. Con esto, se busca facilitar la integración y el uso eficaz de la API por parte de los desarrolladores que necesiten implementar soluciones de pago electrónico.

## Aspectos Generales

*   **API de integración del Banco Nacional de Crédito para operatividad con la Interfaz de Pagos Electrónicos**
*   **Tecnología:** REST
*   **Fecha de generación de la documentación:** 26/08/2024
*   **Versión de la API documentada:** v2.1
*   **EndPoint ambiente de calidad:** `https://servicios.bncenlinea.com:16500/api`
*   **URL de verificación de conexión:** `https://servicios.bncenlinea.com:16500/api/welcome/home`

### Cómo hacer una invocación a la API

Para poder hacer peticiones a la API es necesario tener en cuenta los siguientes aspectos:

Al iniciar las operaciones de la Interfaz de Pagos Electrónicos con el Banco, se le asignará al Cliente una credencial de usuario (`ClientGUID`) y una llave maestra (`Masterkey`) que servirán para encriptar la petición de autenticación. Si la petición es exitosa, esta devolverá una llave de trabajo (`WorkingKey`) para poder realizar las peticiones de los movimientos durante el día. La llave de trabajo vencerá el día de la generación a las 12:00 a.m. (medianoche); por ende, se debe hacer una petición de autenticación diaria para obtener la llave de trabajo durante el día.

**Importante:** Queda a criterio del banco adelantar el vencimiento de la llave de trabajo en cualquier momento por medidas de seguridad. Para ello, la respuesta de la operación incluye, en el código de retorno embebido dentro del mensaje, el valor `RWK`, que significa “Refresh Working Key”. En caso de obtener este retorno, se deberá invocar de nuevo el método de autenticación para obtener una nueva llave de trabajo.

#### Forma del Request:

Todas las peticiones `/json` serán de `content-type="application"`.
Todos los *request*, sin excepción, son de tipo **POST** y deben tener la siguiente forma:

**Ejemplo del Request:**

```json
{
  "ClientGUID":"4A074C46-DD4E-4E54-8010-B80A6A8758F4",
  "Reference":"MiIdentificadorAlfanumericoUnicoEnElDia",
  "Value":"V+aTwhmz9NrCwyFFb6w52Lw+CDFZBqpB3lyCzWIxsVFsnx2ShTrB3rPqR4d+egRNirfBjm6tAuys4ziO5XItfVNlPtYeyjKOUPAdtgxDnVSjNjJxySIIeLhkBXjPZ2dvIYsB8v3I8qEoWhIx+EAalQ==",
  "Validation":"fb8443f34045bdba97a174776205f7fee4e8dd59ccf15cc915d5bf2d2c61841b",
  "swTestOperation":false
}
```

A continuación se describen cada uno de los atributos del *request*:

*   **ClientGUID** (string): Es un identificador único global de 36 caracteres asignado por el banco al Cliente, con el cual será autenticado para las distintas peticiones y le servirá para su autenticación.
*   **Reference** (string): Este parámetro es utilizado para los movimientos. Este campo lo utiliza el Banco para marcar los movimientos realizados con este valor, identificando la petición o movimiento solicitado por el Cliente. El mismo debe ser un identificador único durante el día, debe ser elegido por el Cliente y podría servirle para identificar su transacción cuando obtenga una respuesta. Adicionalmente, se utiliza para garantizar que una transacción no se duplique.
*   **Value** (string): El parámetro `Value` será el resultado de la solucitud que se desea realizar, serializado en JSON y encriptado bajo el algoritmo **AES de Rijndael**.

    **Ejemplo:**

    Usaremos datos reales para simular el *request* y que así pueda comparar su método de encriptación. Supongamos que el *request* que se desea realizar es un **Logon**, que tiene el siguiente contenido:

    ```json
    {"ClientGUID":"4A074C46-DD4E-4E54-8010-B80A6A8758F4"}
      <= Este es el request de Logon que se desea encriptar.
    ```
    Utilizaremos el `MasterKey` como llave para la encriptación. El resultado de esa encriptación será:

    ```
    V+aTwhmz9NrCwyFFb6w52Lw+CDFZBqpB3lyCzWIxsVFsnx2ShTrB3rPqR4d+egRNirfBjm6tAuys4ziO5XItfVNlPtYeyjKOUPAdtgxDnVSjNjJxySIIeLhkBXjPZ2dvIYsB8v3I8qEoWhIx+EAalQ=
     <= parametros encriptados.
    ```
    Ese resultado es el valor que se debe enviar en el parámetro `Value`.

    **NOTA:** El servicio de **Logon** es el único que debe ser encriptado con el `MasterKey`; el resto de los servicios deben ser encriptados con el `WorkingKey`, que será obtenido en la respuesta cuando se ejecute con éxito el `Logon`. Se puede usar el ejemplo anterior para realizar pruebas y verificar que el encriptado sea el mismo. Sin embargo, se debe resaltar que las credenciales que debe usar en su desarrollo serán las suministradas por el equipo de Soluciones en Línea del Banco.

*   **Validation** (string): Tal como el `Value`, el parámetro `Validation` debe ser el *request* que se debe enviar. Utilizamos como ejemplo el *request* del **Logon**, que es:
    ```json
    {"ClientGUID":"4A074C46-DD4E-4E54-8010-B80A6A8758F4"}
    ```
    En este caso, se debe encriptar en **Hash SHA256**, el cual es un método estándar de firma universal, y permitirá usar dicho parámetro como elemento validador de la petición.

*   **swTestOperation** (bool): Parámetro que indica si la petición es una prueba de integración. Si el valor es `"true"`, solo se validará la petición y se devolverá un mensaje de `OK`, sin procesar la transacción de manera formal. Por otro lado, si el valor es `"false"`, la operación es definitiva y se llevará a cabo el proceso necesario para ejecutar el método. Por lo general, para las pruebas debe estar en `false`.

**Ejemplo completo del request (para Logon):**

```json
Parametros del value que se deben encriptar en un Logon:
parametros = { "ClientGUID": "4A074C46-DD4E-4E54-8010-B80A6A8758F4" } <= Encriptar el json con los parametros de la Transacción 
en su programa construir el objeto a enviar:
{
    "ClientGUID": "4A074C46-DD4E-4E54-8010-B80A6A9058H4", 
    "Reference": "MireferenciaUnicaEnElDia", 
    "Value":"V+aTwhmz9NrCwyFFb6w52Lw+CDFZBqpB3lyCzWIxsVFsnx2ShTrB3rPqR4d+egRNirfBjm6A uys4ziO5XItfVNlPtYeyjKOUPAdtgxDnVSjNjJxySIIeLhkBXjPZ2dvIYsB8v3I8qEoWhIx+EAalQ==", <= objeto parametros encriptado en AES
    "Validation": "fb8443f34045bdba97a174776205f7fee4e8dd59ccf15cc915d5bf2d2c61841b", <= objeto parametros encriptado en SHA256
    "swTestOperation": false <= false para pruebas funcionales
}
```

#### Estructura de la Respuesta:

Todas las respuestas, sin excepción, tendrán la siguiente forma:

```json
{
    "status": "OK",
    "message": "000000Se ha iniciado sesión exitosamente.",
    "value": "Yci8FE7upBe9uI3WHPfg8sXsNCkAYwkKUDSyWKGq6R0AkiURhY4DW1coQ4ttu3aE6V4OWUPCaY0O9lBxTHJ1fTeotJOz3JNc4nIeDcCwL6B2skc2vyrbd+c6/zUg0teYSYuaJII4+eNuO2eTjXAluw==", 
    "validation": "c2ab5bfeed32b81a1be0e21e89c02374ea2987e3c2a351e6a4044dce3885ca58"
}
```

*   **Status** (string): Este campo contiene si el resultado es exitoso `“OK”` o si es fallido `“KO”`.
*   **Message** (string): Código de 6 caracteres seguido del mensaje de longitud libre.

Los Campos `"Value"` y `"Validation"`, como en el ejemplo del *request* estarán encriptados en el mismo formato correspondiente. Dicho esto, para obtener el contenido de la respuesta, será necesario desencriptar el campo `"Value"` utilizando la misma clave de encriptación que se usó durante el proceso de la solicitud.

### Importante: ChildClientID & BranchID

El API de integración del Banco Nacional de Crédito está diseñado para ser flexible y cumplir con los requerimientos de sus clientes, ya sea una cuenta principal, un cliente que tenga sedes o asociados. Esa es principalmente la función de estos dos parámetros.

**ChildClientID:** Supongamos que la empresa "Red de Supermercados Padre" es un cliente principal y le han otorgado sus credenciales y a su vez, "Red de Supermercados Padre" tiene una amplia red de sucursales en todo el país que tienen su propia razón social. Para eso es justamente el `ChildClientID` (ejemplo: `"J00000000"`), para identificar a través del RIF a esa sucursal asociada que tiene su propia cuenta y que desea manejar sus pagos fuera de la cuenta principal del Padre.

**BranchId:** Siguiendo con el ejemplo de `ChildClientID`, ahora supongamos que uno de los "Hijos" de "Red de Supermercados Padre" es "Supermercados Hijo", que también a su vez tiene varias sedes, ejemplo "Supermercado Hijo Sede Miranda", "Supermercado Hijo Sede Bolívar". En este caso, la identificación de cada una de las sedes que tiene "Hijo" será el `BranchId`. Ejemplo:

Todos los casos comparten el `ClientGUID`: `4A074C46-DD4E-4E54-8010-B80A6A9058H4` pero se identifican con los parametros mencionados.

*   **"Supermercado Padre":** `ClientGUID`: `4A074C46-DD4E-4E54-8010-B80A6A9058H4`
*   **"Supermercado Hijo":** `ClientGUID`: `4A074C46-DD4E-4E54-8010-B80A6A9058H4`, `ChildClientID`: `"J00000000"`
*   **"Supermercado Hijo Sede Miranda":** `ClientGUID`: `4A074C46-DD4E-4E54-8010-B80A6A9058H4`, `ChildClientID`: `"J00000000"`, `BranchId`: `"CS400"`
*   **"Supermercado Hijo Sede Bolívar":** `ClientGUID`: `4A074C46-DD4E-4E54-8010-B80A6A9058H4`, `ChildClientID`: `"J00000000"`, `BranchId`: `"CS401"`

Entonces se puede resumir que, para que una "Sede del Hijo" o quizas podemos llamarlo Nieto, cuando haga una transacción, lo único que tiene que hacer diferente a los demás es enviar, dentro de los parámetros de la transacción, el `ChildClientId` y el `BranchId`. Y si es "Hijo", enviar solo el `ChildClientId`.

**Nota:** La cuenta principal (cuenta Padre) será la responsable de generar diariamente el `WorkingKey` con el servicio de autenticación (Endpoint `Auth`), la cual se utilizará para realizar las solicitudes al API. Este `WorkingKey` que se ha generado deberá ser proporcionado a los asociados para que puedan operar con dicha llave.

**Ejemplo:**

// Transacción de la cuenta principal (Padre):```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584242207524",
  "BeneficiaryEmail": "",
  "BeneficiaryID" : "V23000760",
  "BeneficiaryName": "PruebaBNCLeo",
  "Description": "PruebaBNCLeoConRef",
  "OperationRef": "115621dsf" 
}
```

// Transacción de un asociado de la cuenta principal (Hijo):
```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584242207524",
  "BeneficiaryEmail": "",
  "BeneficiaryID" : "V23000760",
  "BeneficiaryName": "PruebaBNCLeo",
  "Description": "PruebaBNCLeoConRef",
  "OperationRef": "115621dsf",
  "ChildClientID":"J00000000", 
}
```

// Transacción de una sede de un asociado (Sede de Hijo):
```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584242207524",
  "BeneficiaryEmail": "",
  "BeneficiaryID" : "V23000760",
  "BeneficiaryName": "PruebaBNCLeo",
  "Description": "PruebaBNCLeoConRef",
  "OperationRef": "115621dsf",
  "ChildClientID":"J00000000",    
  "BranchID":"CS400"
}
```

## En Postman

### Cómo utilizar la colección:

Para realizar pruebas automatizadas en Postman, deberá presionar el botón naranja **"Run in Postman"**, que se encuentra en la esquina superior derecha de esta documentación. A continuación, elija el entorno en el que utilizará Postman (se recomienda usar Postman para Windows). Se abrirá una ventana en la que deberá importar la colección de Postman.

Una vez importada la colección y ya dentro de Postman, en la esquina superior derecha encontrará un botón con el *tooltip* **"Variables"**. Al presionarlo, se abrirá una ventana con todas las variables de la colección, debe llenar estas con su `ClientGUID` y `MasterKey` o puede modificar el `urlbase`, dependiendo del ambiente en el que desea trabajar.

¡listo! Ya podrá utilizar una colección totalmente funcional.

Ahora bien, la manera en que se usa la colección está diseñada para poder ofrecer un ejemplo práctico de todo el proceso de encriptación, pero **no se debe confundir el objeto que se envía en el *body* con el que se debería enviar realmente al final**, el cual podrá verlo en la pestaña `'Test'` después de generada cada petición que sería el objeto completo que se envia al API.

### Automatización de métodos de encriptación:

Con el fin de simplificar y ayudarle a comprender la encriptación, se han creado, junto con la documentación en la colección, algunos *scripts* que se ejecutan en el *pre-request* y *post-response* de Postman. En estos *scripts* podrá encontrar clases de ejemplo en **JavaScript** para encriptar en SHA256, AES y desencriptar AES. Podrá acceder a ellos haciendo clic en la colección en el menú de la izquierda, donde se encuentran todos los *requests*, y posteriormente en la pestaña **"Scripts"**.

**Nota:** Algunos métodos son para uso exclusivo de Postman con la finalidad de completar las pruebas. Además, en la pestaña *test* de postman podrán ver la reseña del objeto definitivo que se envió después de encriptar los parámetros, la respuesta de la API y el *value* desencriptado que será la respuesta final de su transacción.

¡Listo! ya puedes comenzar a trabajar con el API de integración del Banco Nacional de Crédito.

Los campos marcados con `(*)` son **obligatorios**.

## La encriptación

### Descripción General

Es importante aclarar que para reforzar la seguridad criptográfica debe realizar previamente algunos cambios en la llave de encriptación original. A continuación un ejemplo de esto utilizando Javascript:

```javascript
class DataCypher {
    constructor(encryptionKey) {
        // Se define la constante 'saltBytes' que representa un array de bytes en formato hexadecimal.
        const saltBytes = this.byte([0x49, 0x76, 0x61, 0x6e, 0x20, 0x4d, 0x65, 0x64, 0x76, 0x65, 0x64, 0x65, 0x76]);
        // Se convierte 'saltBytes' a un formato que puede ser utilizado por CryptoJS.
        const salt = CryptoJS.enc.Hex.parse(saltBytes);
        // Se genera una clave y un vector de inicialización utilizando el mecanismo PBKDF2.
        const keyAndIv = CryptoJS.PBKDF2(encryptionKey, salt, {
            keySize: 48 / 4, // El tamaño de la clave y IV derivados. 48 bits dividido por 4 equivale a 12 palabras (32 bytes en total).
            iterations: 1000, // Cantidad de iteraciones para aumentar la seguridad del algoritmo.
            hasher: CryptoJS.algo.SHA1 // Algoritmo de hash SHA-1 utilizado durante la derivación de la clave.
        });
            // Se asigna la clave derivada que corresponde a los primeros 8 valores de palabras del resultado.
        this.key = CryptoJS.lib.WordArray.create(keyAndIv.words.slice(0, 8), 32); // Clave de 32 bytes
        // Se asigna el vector de inicialización (IV) que corresponde a los siguientes 4 valores de palabras.
        this.iv = CryptoJS.lib.WordArray.create(keyAndIv.words.slice(8, 12), 16); // IV de 16 bytes
    }
    // funcion que utilizamos en JS para convertir a byte
    byte(arr) {
        return arr.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // Metodo para encriptar en AES
    encryptAES(text) {
        const textWordArray = CryptoJS.enc.Utf16LE.parse(text);
        const encrypted = CryptoJS.AES.encrypt(textWordArray, this.key, {
            iv: this.iv,
        });
        return encrypted.toString();
    }
    // Metodo para desencriptar en AES
    decryptAES(text) {
        const decrypted = CryptoJS.AES.decrypt(text, this.key, {
            iv: this.iv,
        });
        return decrypted.toString(CryptoJS.enc.Utf16LE);
    }
    // metodo para encriptar en Sha256
    encryptSHA256(requestData) {
        const hash = CryptoJS.SHA256(requestData);
        return hash.toString(CryptoJS.enc.Hex);
    }
}
```

**Elementos:**

*   **encryptionKey:** Es la cadena de texto (o bytes) proporcionada, en este caso sería el `MasterKey` en caso de `Logon` o `WorkingKey` para los demás *request*.

**Generación de Sal (Salt):** Se define una secuencia de bytes que se usará como una "sal". La sal es un valor que se agrega a los datos de entrada durante el proceso de derivación de clave. Su propósito es aumentar la seguridad, haciendo que la misma entrada produzca resultados diferentes en múltiples ocasiones.

**Derivación de Clave:** Se utiliza un algoritmo estándar de derivación de claves, como **PBKDF2** (Password-Based Key Derivation Function 2), que toma la `encryptionKey` y la sal generada como entradas.

Este proceso implica:

1.  **Tamaño de la clave:** Especificar cuántos bits o bytes se desean en la clave resultante.
2.  **Iteraciones:** Ejecutar el proceso un número determinado de veces, lo que aumenta la dificultad para un ataque de fuerza bruta, ya que tarda más tiempo en calcularse.
3.  **Función de hash:** Usar una función de *hash* criptográfica para procesar la entrada y generar el resultado.

**Asignación de Clave y IV:**

Una vez que se ha derivado una salida, esta se divide en dos partes:

*   **Clave (Key):** La primera parte se utiliza como la clave de cifrado final, que es un valor crítico para proteger los datos.
*   **Vector de Inicialización (IV):** La segunda parte se utiliza como el IV, que se aplica en métodos de cifrado para garantizar que los datos cifrados sean únicos, incluso cuando la misma entrada y clave se utilizan nuevamente.

**En Conclusión:**

*   **salt:** Un valor usado para fortalecer el proceso de derivación de la clave.
*   **keyAndIv:** Resultado de la aplicación del algoritmo de derivación de clave, que contiene tanto la clave como el IV.
*   **key:** La clave final que se usará para el proceso de cifrado.
*   **iv:** El vector de inicialización que complementa la clave en el proceso de cifrado, asegurando que el resultado sea único.

**Nota:** No necesariamente tienes que ser un experto en criptografía para utilizar nuestra API. Actualmente, el equipo de Soluciones en Línea posee todos estos métodos escritos en los lenguajes de programación más usados. Solo indícanos qué lenguaje usas y te lo proporcionaremos.

## Códigos y mensajes de error

### Pago Móvil

| Código | Descripción |
| :--- | :--- |
| G05 | Existen problemas de comunicación, por favor intente de nuevo en unos minutos |
| G12 | Existen problemas de comunicación, por favor intente de nuevo en unos minutos |
| G14 | Es posible que el beneficiario no se encuentre afiliado al servicio de Pago Móvil |
| G41 | Es posible que el beneficiario no se encuentre afiliado al servicio de Pago Móvil |
| G43 | Es posible que el beneficiario no se encuentre afiliado al servicio de Pago Móvil |
| G51 | Fondos insuficientes |
| G52 | El beneficiario no se encuentra afiliado al servicio de Pago Móvil |
| G61 | Excede el límite de montos diarios mediante Pago Móvil |
| G62 | Beneficiario restringido en el banco destino |
| G65 | Excede el límite de cantidades de transacciones diarias mediante Pago Móvil |
| G80 | Cédula inválida del beneficiario |
| G91 | Existen problemas de comunicación, por favor intente de nuevo en unos minutos |
| G96 | Existen problemas de comunicación, por favor intente de nuevo en unos minutos |

### VPOS

| Código | Denominación | Descripción |
| :--- | :--- | :--- |
| CO1 | Comercio NO Existe | Comercio NO Existe |
| G51 | Fondo Insuficiente | Fondo Insuficiente |
| G01 | Error en Cédula | Error en Cédula |
| G96 | Mal Funcionamiento del Sistema | Mal Funcionamiento del Sistema |
| G05 | No Honrar | No Honrar |
| G56 | Tarjeta/Telf no Registrado | Tarjeta/Telf no Registrado |
| G00 | Aprobado | Aprobado |
| G01 | Error en Cédula | Error en Cédula |
| G02 | Referirse a Banco Emisor | Referirse a Banco Emisor |
| G03 | Inválido | Inválido |
| G04 | Retener Tarjeta | Retener Tarjeta |
| G05 | Dudosa Reputación | Dudosa Reputación |
| G06 | Error | Error |
| G10 | Aprobado | Aprobado |
| G11 | Aprobado | Aprobado |
| G12 | Inválido | Inválido |
| G13 | Inválido | Inválido |
| G14 | Inválido | Inválido |
| G16 | Aprobado | Aprobado |
| G17 | Cancelado | Cancelado |
| G36 | Tarjeta Restringida | Tarjeta Restringida |
| G38 | PIN Excedido | PIN Excedido |
| G43 | Tarjeta Robada | Tarjeta Robada |
| G51 | Fondo Insuficiente | Fondo Insuficiente |
| G54 | Caduca Tarjeta | Caduca Tarjeta |
| G55 | PIN Inválido | PIN Inválido |
| G58 | Transacción no Permitida | Transacción no Permitida |
| G59 | Sospecha de Fraude | Sospecha de Fraude |
| G61 | Retiro Excedido Limitado | Retiro Excedido Limitado |
| G62 | Tarjeta Restringida | Tarjeta Restringida |
| G63 | Violación de Seguridad | Violación de Seguridad |
| G65 | Retiro Excedido Frecuentemente | Retiro Excedido Frecuentemente |
| G68 | Respuesta Recibida | Respuesta Recibida |
| G75 | PIN Excedido | PIN Excedido |
| G77 | Intervenir | Intervenir |
| G78 | Intervenir | Intervenir |
| G90 | Suspensión en Progreso | Suspensión en Progreso |
| G91 | Emisor No Operativo | Emisor No Operativo |
| G92 | Error de Ruta | Error de Ruta |
| G93 | Violación de Leyes | Violación de Leyes |
| G94 | Transacción Duplicada | Transacción Duplicada |
| G96 | Mal Funcionamiento del Sistema | Mal Funcionamiento del Sistema |
| G98 | Excedido Límite de Efectivo | Excedido Límite de Efectivo |
| ECBE01 | BIN o longitud de TDD/TDC inválido | BIN o longitud de TDD/TDC inválido |
| EGA80 | Número de tarjeta inválido | Número de tarjeta inválido |

### C2P

| Código | Descripción |
| :--- | :--- |
| G56 | Tarjeta/Telf no Registrado | Tarjeta/Telf no Registrado |
| G13 | Inválido | Inválido |
| G55 | PIN Incorrecto | PIN Incorrecto |
| G91 | Emisor Inoperativo | Emisor Inoperativo |
| G41 | Tarjeta Extraviada | Tarjeta Extraviada |
| G61 | Retiro Excedido Limitado | Retiro Excedido Limitado |

### Generales

| Código | Descripción |
| :--- | :--- |
| EPIMC1 | Cliente sin permisos del ChildClient | Cliente sin permisos del ChildClient |
| EPIMC2 | Comercio no encontrado | Comercio no encontrado |
| EPIEDD | Error de comunicación | Error de comunicación |
| EPIE00 | Ha ocurrido un error interno | Ha ocurrido un error interno |
| EPIE02 | Excepción interna en proceso delegado | Excepción interna en proceso delegado |
| EPIE03 | Excepción validando la petición | Excepción validando la petición |
| EPIR01 | Excepción interna manejando solicitud de logon | Excepción interna manejando solicitud de logon |
| EPIR02 | El ClientGUID dentro de la petición difiere del ClientGUID proveniente del objeto ApiRequest | El ClientGUID dentro de la petición difiere del ClientGUID proveniente del objeto ApiRequest |
| EPIR03 | No se ha podido procesar su solicitud. | No se ha podido procesar su solicitud. |
| EPIKNF | Ha ocurrido un error interno | Ha ocurrido un error interno |
| EPICNF | No es posible encontrar al cliente especificado, o el mismo no se encuentra activo | No es posible encontrar al cliente especificado, o el mismo no se encuentra activo |
| EPIRWK | Petición denegada por medidas de seguridad | Petición denegada por medidas de seguridad |
| EPIONA | No cuenta con los permisos para realizar esta operación | No cuenta con los permisos para realizar esta operación |
| EPIIMS | El modelo recibido no cumple con las validaciones | El modelo recibido no cumple con las validaciones |
| EPIHV | Hash de la petición inválido | Hash de la petición inválido |
| EPIEMP | Excepción al insertar transacción P2P | Excepción al insertar transacción P2P |
| EPIAVF | Error de validación obteniendo cuentas del cliente | Error de validación obteniendo cuentas del cliente |
| EPICCA | Error de comunicación obteniendo cuentas del cliente | Error de comunicación obteniendo cuentas del cliente |
| EPIAVM | No se completó la validación de la cuenta | No se completó la validación de la cuenta |
| EPIECP | Excepción al insertar transacción C2P | Excepción al insertar transacción C2P |
| P2PEMP | Excepción al insertar transacción P2P | Excepción al insertar transacción P2P |
| EPIANF | No se encontraron las cuentas del cliente | No se encontraron las cuentas del cliente |
| EPIEBR | Excepción agregando parámetros al request | Excepción agregando parámetros al request |
| EPIESF | Excepción ejecutando petición en cliente | Excepción ejecutando petición en cliente |
| EPIGN1 | Excepción consultando el GUID de Novared | Excepción consultando el GUID de Novared |
| EPIGN2 | Excepción consultando el GUID de Novared | Excepción consultando el GUID de Novared |
| EPIURS | Status de respuesta inesperado a la petición | Status de respuesta inesperado a la petición |

### Débito inmediato:

| Código ISO | DENOMINACIÓN | DESCRIPCIÓN |
| :--- | :--- | :--- |
| AC00 | Operación en espera de respuesta del receptor | Operación en espera de respuesta del receptor. Código solo generado para los Información del Estado del Pago (Status Report) |
| AB01 | Tiempo de espera agotado | Proceso cancelado debido al tiempo de espera. Tiempo Máximo: 120 segundos |
| AB07 | Agente fuera de línea | El agente del mensaje no está en línea. |
| AC01 | Número de cuenta incorrecto | El número de cuenta no es válida o falta. |
| AC04 | Cuenta cancelada | El número de cuenta se encuentra cancelado por parte del Banco Receptor. |
| AC06 | Cuenta bloqueada | La cuenta especificada está bloqueada por parte del Banco Receptor. |
| AC09 | Moneda no válida | Moneda no válida o no existe. |
| ACCP | Operación aceptada | Operación aceptada. |
| AG09 | Pago no recibido | Operación no recibida. |
| AG10 | Agente suspendido o excluido | El agente de mensaje está suspendido del sistema de pago nacional. |
| AM02 | Monto de la transacción no permitido | El monto de la transacción no cumple con el acuerdo establecido (De acuerdo a lo indicado en aclaratoria funcional vigente) |
| AM03 | Moneda no permitida | El monto especificado se encuentra en una moneda no definida en los acuerdos establecidos |
| AM04 | Saldo insuficiente | Fondo insuficiente, no puede cubrir el monto especificado en el mensaje. |
| AM05 | Operación duplicada | Operación duplicada |
| BE01 | Datos del cliente no corresponden a la cuenta | La identificación del cliente final no es coherente con el número de cuenta asociado. |
| BE20 | Longitud del nombre invalida | La longitud del nombre supera el máximo permitido. |
| CUST | Solicitud de cancelación realizada por el deudor | Cancelación solicitada por el deudor. Cliente deudor declina la operación Débito Inmediatos de manera directa |
| CH20 | Número de decimales incorrecto | Número de decimales supera el máximo permitido. |
| DT03 | Fecha de procesamiento no bancaria no válida | Operación con fecha valor no válida. |
| DU01 | Identificación de mensaje duplicado | La Identificación de mensaje está duplicada. |
| FF05 | Código del producto incorrecto | El Código del producto es inválido o no existe. |
| FF07 | Código del subproducto incorrecto | El Código del subproducto es inválido o no existe. |
| RC08 | Código del Banco no existe en el sistema de compensación /Liquidación. | Código del Banco no existe en el sistema de compensación /Liquidación. |
| RJCT | Operación rechazada | Operación rechazada. |
| TKCM | Código único de operación de débito incorrecto. | Código único de operación de aceptación de débito incorrecto. Cliente deudor declina la operación Débito Inmediatos de manera directa |
| VE02 | Error Técnico de Persistencia | Persistencia de escritura. |
| ACCP | Operación aceptada | Operación aceptada. |

### Crédito inmediato:

| Código ISO | DENOMINACIÓN | DESCRIPCIÓN |
| :--- | :--- | :--- |
| AC00 | Operación en espera de respuesta del receptor | Operación en espera de respuesta del receptor. Código solo generado para los Información del Estado del Pago (Status Report) |
| AB01 | Tiempo de espera agotado | Proceso cancelado debido al tiempo de espera. Tiempo Máximo: 120 segundos |
| AB07 | Agente fuera de línea | El agente del mensaje no está en línea. |
| AC01 | Número de cuenta incorrecto | El número de cuenta no es válida o falta. |
| AC04 | Cuenta cancelada | El número de cuenta se encuentra cancelado por parte del Banco Receptor. |
| AC06 | Cuenta bloqueada | La cuenta especificada está bloqueada por parte del Banco Receptor. |
| AC09 | Moneda no válida | Moneda no válida o no existe. |
| ACCP | Operación aceptada | Operación aceptada. |
| AG09 | Pago no recibido | Operación no recibida. |
| AG10 | Agente suspendido o excluido | El agente de mensaje está suspendido del sistema de pago nacional. |
| AM02 | Monto de la transacción no permitido | El monto de la transacción no cumple con el acuerdo establecido (De acuerdo a lo indicado en aclaratoria funcional vigente) |
| AM03 | Moneda no permitida | El monto especificado se encuentra en una moneda no definida en los acuerdos establecidos |
| AM04 | Saldo insuficiente | Fondo insuficiente, no puede cubrir el monto especificado en el mensaje. |
| AM05 | Operación duplicada | Operación duplicada |
| BE01 | Datos del cliente no corresponden a la cuenta | La identificación del cliente final no es coherente con el número de cuenta asociado. |
| BE20 | Longitud del nombre invalida | La longitud del nombre supera el máximo permitido. |
| CUST | Solicitud de cancelación realizada por el deudor | Cancelación solicitada por el deudor. Cliente deudor declina la operación Débito Inmediatos de manera directa |
| CH20 | Número de decimales incorrecto | Número de decimales supera el máximo permitido. |
| DT03 | Fecha de procesamiento no bancaria no válida | Operación con fecha valor no válida. |
| DU01 | Identificación de mensaje duplicado | La Identificación de mensaje está duplicada. |
| FF05 | Código del producto incorrecto | El Código del producto es inválido o no existe. |
| FF07 | Código del subproducto incorrecto | El Código del subproducto es inválido o no existe. |
| RC08 | Código del Banco no existe en el sistema de compensación /Liquidación. | Código del Banco no existe en el sistema de compensación /Liquidación. |
| RJCT | Operación rechazada | Operación rechazada. |
| VE01 | Rechazos técnico | Rechazo Técnico. Rechazo Técnico para Débito Inmediatos error generado por un conjunto de procedimientos, acciones y protocolos no determinados o inválidos en el intercambio de operaciones entre el Sistema CCE/SIMF y la IBP Ordenante o Receptora |
| FF05 | Código del producto incorrecto | El Código del producto es inválido o no existe. |

### Estatus de operaciones SIMF:

| Código ISO | DENOMINACIÓN | DESCRIPCIÓN |
| :--- | :--- | :--- |
| SMF001 | Operación no encontrada | En caso de no conseguir el registro que a consultar |

---

# Servicios:

## Autenticacíon

Este método permite solicitar al API una nueva clave de trabajo (`WorkingKey`) para cifrar las operaciones solicitadas.

### POST: Logon

`https://servicios.bncenlinea.com:16500/api/Auth/LogOn`

**Parámetros de la transacción:**

*   `ClientGUID`*: String, representa el código asignado por el banco para identificar al cliente.

**Parámetros de respuesta de la transacción:**

*   `WorkingKey`: String, utilizará para cifrar todas las peticiones enviadas al API. El resultado de esta cifrado debe ser incluido en el campo `"Value"` de la solicitud.

| Ejemplo (Value desencriptado) |
| :--- |
| `{"WorkingKey":"dc33ec0e7de19f6da415b4d81f4dd704"}` |

**Body** (raw (json))
```json
{
  "ClientGUID": "Introduzca su ClientGUID aquí."
}
```

**Example Request (cURL)**
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Auth/LogOn',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{
  "ClientGUID": "Introduzca su ClientGUID aquí."
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)
```json
//value desencriptado: {"WorkingKey":"dc33ec0e7de19f6da415b4dasd4dd704"}

{
  "status": "OK",
  "message": "000000Se ha iniciado sesión exitosamente.",
  "value": "Yci8FE7upBe9uI3WHPfg8sK+KK4K/gmQpyyIhl38Ley6Qc23i5vq3kH3h6Umc4HrHX34BEsq908gTIuwkJJnV431yHqpPA0F09OCSEvCHpRuC6ZpMJrHgiy/aEF3ljtyxFxjKMFggEFPv8iq44UHeA==",
  "validation": "11fe5bb98c8cd29c5b92b80a3e29bfa6773f544c9c8b32bc73aff3868e613815"
}
```

## P2P

**Emisión de Pago Móvil**

Es la facilidad que ofrece BNC a sus clientes jurídicos para realizar pagos interbancarios de forma inmediata entre cuentas BNC o entre otros bancos afiliados al Servicio de Pago Móvil Interbancario, logrando con ello movilizar sus fondos de manera electrónica, rápida y segura.

**Características.**

*   El comercio debe estar afiliado a Pago Móvil Interbancario.
*   El comercio debe estar afiliado al Servicio BNCNET Empresas.
*   La operación es de forma inmediata y segura.
*   El cliente receptor debe suministrar al comercio su número telefónico, el banco afiliado y su cédula de identidad.
*   Las transacciones tendrán límites de montos y cantidades establecidos por BNC.

**Beneficios.**

*   Facilidad a la hora de recibir pagos y proporcionar cambio a sus clientes de manera sencilla, rápida y eficiente.
*   Transacciones respaldadas a través de registros electrónicos, que garantiza la trazabilidad y la seguridad en cada pago móvil realizado.
*   Comodidad y flexibilidad, al no depender de un punto de venta físico, tarjeta o dinero en efectivo a la hora de dar cambio a los clientes, ya que pueden emitir pagos desde cualquier lugar y en cualquier momento.
*   Reducción de manejo de efectivo ya que al utilizar pagos móviles, se incrementan las medidas de bioseguridad al reducir el manejo de dinero en efectivo.

### POST: Generar un pago P2P

`https://servicios.bncenlinea.com:16500/api/MobPayment/SendP2P`

**Parámetros de la transacción:**

*   `Amount`*: Decimal (13, 2), es el monto de la operación.
*   `BeneficiaryBankCode`*: Int 32bits, es el código del banco destino. Ejemplo: `191`.
*   `BeneficiaryCellPhone`*: String, es el número de teléfono del beneficiario con código de país. Ejemplo: `584241234567`.
*   `BeneficiaryEmail`: String, se utiliza para especificar un correo electrónico a notificar con la emisión de la operación. En caso de no enviarlo y quedar `null`, no se enviará notificación de correo electrónico con la operación.
*   `BeneficiaryID`*: String, es el documento de identidad del beneficiario, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `V012345678`.
*   `BeneficiaryName`*: String, es el nombre del beneficiario del pago móvil (Utilizado para el envío de notificación vía Email).
*   `Description:`* String, permite hasta 100 caracteres para especificar el concepto de la operación.
*   `OperationRef`: String, permite hasta 20 caracteres. Indica una referencia interna del cliente que permitirá validar si un pago se realizó con éxito antes de procesar.
*   `ChildClientID`: String, es el documento de identidad del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `V012345678`.** En caso de no enviarlo y quedar `null`, se utilizarán los datos del beneficiario que correspondan al GUID.**
*   `BranchID`: String, es el código asignado a la sucursal del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal. Ejemplo: `CCS001`. **En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al ChildClientID por defecto.** Debe enviarse el `ChildClientID` para funcionar correctamente.

**Parámetros de respuesta de la transacción:**

*   `Reference`: String, referencia de la operación.
*   `AuthorizationCode`: String, código autorizador de la operación.
*   `SwAlreadySent`: Bool, indica si el pago, identificado con el `OperationRef` enviado, se realizó anteriormente con éxito. En caso de ser un pago que ya se haya realizado con éxito, devolverá `true` con el `Reference` y `AuthoriztionCode` de la operación, en caso contrario, devolverá `false` con el `Reference` y `AuthoriztionCode` de la operación actual.

| Ejemplo (Value desencriptado) |
| :--- |
| `{"Reference":"12283","AuthorizationCode":"324072","SwAlreadySent":false}` |

**Body** (raw (json))
```json
{
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584242207524",
  "BeneficiaryEmail": "",
  "BeneficiaryID": "V23000760",
  "BeneficiaryName": "test name",
  "Description": "description",
  "OperationRef": "",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Example Request (cURL)**
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/MobPayment/SendP2P',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{ 
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584242207524",
  "BeneficiaryEmail": "",
  "BeneficiaryID" : "V23000760",
  "BeneficiaryName": "PruebaBNCLeo",
  "Description": "PruebaBNCLeoConRef",
  "ChildClientID": "",
  "OperationRef": "",
  "BranchID": ""
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)
```json
//value desencriptado: {"Reference":"12283","AuthorizationCode":"324072","SwAlreadySent":false}

{
  "status": "OK",
  "message": "000000Pago Móvil procesado por un monto de 10.01, Código de Autorización: 036626, Nro de Referencia: 12285",
  "value": "qXDdEjSSTQTbLO/fl+GbhwSaQM9tWUPYx1x+WIZqQHyh91Y0Wu3V/BaEsQPnAqplXVyxMLiQ0GRcdvCzKQ5VdVs1pZfbBqIaa+6uJCNCRvQl5abt7eFpv7slD0PPGpJSZWouHIeCbkbVMyxtADuzRk5MGQlOJicQchuypoiB7ZT9w8YHX61Im8REBJdh6d6kYC79AJ44glGxn/8vynXInQ==",
  "validation": "1739c24d320a6bb5f086458776d78c3a99a95aeec626f9a3b27c200fca7f5e79"
}
```

### POST: Generar QR P2P

`https://servicios.bncenlinea.com:16500/api/MobPayment/GenerateP2PQr`

**Parámetros de la transacción:**

*   `Amount`*: Decimal (13, 2), es el monto de la operación.
*   `BeneficiaryBankCode`*: Int 32bits, es el código del banco destino. Ejemplo: `191`.
*   `BeneficiaryCellPhone`*: String, es el número de teléfono del beneficiario con código de país. Ejemplo: `584241234567`.
*   `BeneficiaryEmail`: String, se utiliza para especificar un correo electrónico a notificar con la emisión de la operación. En caso de no enviarlo y quedar `null`, no se enviará notificación de correo electrónico con la operación.
*   `BeneficiaryID`*: String, es el documento de identidad del beneficiario, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `V012345678`.
*   `BeneficiaryName`*: String, es el nombre del beneficiario del pago móvil (Utilizado para el envío de notificación vía Email).
*   `Description:`* String, permite hasta 100 caracteres para especificar el concepto de la operación.
*   `OperationRef`: String, permite hasta 20 caracteres. Indica una referencia interna del cliente que permitirá validar si un pago se realizó con éxito antes de procesar.
*   `ChildClientID`: String, es el documento de identidad del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `V012345678`.** En caso de no enviarlo y quedar `null`, se utilizarán los datos del beneficiario que correspondan al GUID.**
*   `BranchID`: String, es el código asignado a la sucursal del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal. Ejemplo: `CCS001`. **En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al ChildClientID por defecto.** Debe enviarse el `ChildClientID` para funcionar correctamente.

**Parámetros de respuesta de la transacción:**

*   `Reference`: String, referencia de la operación.
*   `AuthorizationCode`: String, código autorizador de la operación.
*   `SwAlreadySent`: Bool, indica si el pago, identificado con el `OperationRef` enviado, se realizó anteriormente con éxito. En caso de ser un pago que ya se haya realizado con éxito, devolverá `true` con el `Reference` y `AuthoriztionCode` de la operación, en caso contrario, devolverá `false` con el `Reference` y `AuthoriztionCode` de la operación actual.

| Ejemplo (Value desencriptado) |
| :--- |
| `{"Reference":"12283","AuthorizationCode":"324072","SwAlreadySent":false}` |

**Body** (raw (json))
```json
{
    "BankCode": "0191",
    "description": "PRUEBA", 
    "amount": "01.00"
}
```

**Example Request (cURL)**
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/MobPayment/SendP2P',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{ 
  "Amount": 10.01,
  "BeneficiaryBankCode": 191,
  "BeneficiaryCellPhone": "584242207524",
  "BeneficiaryEmail": "",
  "BeneficiaryID" : "V23000760",
  "BeneficiaryName": "PruebaBNCLeo",
  "Description": "PruebaBNCLeoConRef",
  "ChildClientID": "",
  "OperationRef": "",
  "BranchID": ""
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)
```json
//value desencriptado: {"Reference":"12283","AuthorizationCode":"324072","SwAlreadySent":false}

{
  "status": "OK",
  "message": "000000Pago Móvil procesado por un monto de 10.01, Código de Autorización: 036626, Nro de Referencia: 12285",
  "value": "qXDdEjSSTQTbLO/fl+GbhwSaQM9tWUPYx1x+WIZqQHyh91Y0Wu3V/BaEsQPnAqplXVyxMLiQ0GRcdvCzKQ5VdVs1pZfbBqIaa+6uJCNCRvQl5abt7eFpv7slD0PPGpJSZWouHIeCbkbVMyxtADuzRk5MGQlOJicQchuypoiB7ZT9w8YHX61Im8REBJdh6d6kYC79AJ44glGxn/8vynXInQ==",
  "validation": "1739c24d320a6bb5f086458776d78c3a99a95aeec626f9a3b27c200fca7f5e79"
}
```

## C2P

Este servicio les permite como comercio afiliado a BNC iniciar operaciones de cobro a personas naturales a través del sistema Pago Móvil Interbancario desde su página comercial y/o aplicación móvil, solicitando autorización a su cliente a través de los datos personales y una clave de pago (**Token**).

**Beneficios:**

*   Disponibilidad inmediata de los fondos, sin instrumentos de pago
*   Control detallado de todas las operaciones recibidas en tiempo real.
*   No es necesario la presencia física del cliente pagador.

**Condiciones:**

*   Cliente receptor y pagador deben estar afiliados al servicio Pago móvil.
*   Generar un comprobante electrónico a sus clientes, como constancia del pago de bienes o servicios.

**Clave Token:**

Es una clave de autenticación que les indicará su cliente y la misma la obtiene desde cada institución bancaria que decida el cliente pagador usar como emisor de pago.
Para el caso de BNC, se genera a través de BNCNET mediante las opciones: Pagos > Pago Móvil > **Generador de Token**, los cuales tendrán vigencia hasta las 11:59:59 pm del día de la generación.

### POST: Validar Operaciones con Referencia

`https://servicios.bncenlinea.com:16500/api/Position/Validate`

Consulta por transacción.

**Parámetros de la transacción:**

*   `AccountNumber`*: String, número de cuenta de 20 dígitos del cliente afiliado al API.
*   `Amount`*: Decimal (13,2), monto de la transacción a consultar.
*   `ClientID`*: String, es el documento de identidad del cliente afiliado al API, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `J012345678`.
*   `Reference`*: Int64, referencia de la operación. Se realiza la validación utilizando los últimos 4 dígitos de la referencia proporcionada.
*   `DateMovement`*: Objeto DateTime; fecha del movimiento en formato `"yyyy/MM/ddThh:mm:ss"` de la operación a consultar.
*   `ChildClientID`: String, es el documento de identidad del cliente afiliado al API, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `V012345678`. En caso de no enviarlo y quedar `null`, se utilizarán los datos del cliente afiliado al API que correspondan al GUID.
*   `BranchID`: String, es el código asignado a la sucursal del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal. Ejemplo: `CCS001`. En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al `ChildClientID` por defecto. Debe enviarse el `ChildClientID` para funcionar correctamente.

**Parámetros de respuesta de la transacción:**

*   `Amount`: Decimal, monto de la transacción.
*   `BalanceDelta`: String, indica si es un ingreso o egreso.
*   `ControlNumber`: String, número de control de la transacción.
*   `Code`: String, código de operación.
*   `Date`: fecha del movimiento en formato `dd/MM/yyyy`.
*   `DebtorInstrument`: Instrumento con el que se opera.
*   `Concept`: String, descripción.
*   `DebitAccount`: String, número de cuenta de 20 dígitos.
*   `BankCode`: Int, es el código del banco.
*   `MovementExists`: booleano, verdadero en caso del encontrar la operación especificada.
*   `ReferenceA`: String, referencia 1.
*   `ReferenceB`: String, referencia 2. Este campo puede no tener valor, depende del tipo de movimiento.
*   `ReferenceC`: String, referencia 3. Este campo puede no tener valor, depende del tipo de movimiento.
*   `ReferenceD`: String, referencia 4. Este campo puede no tener valor, depende del tipo de movimiento.
*   `Type`: String, tipo de movimiento.
*   `DebtorID`: String, Este campo retorna el numero de documento del pagador cuando la transaccion es de tipo 388 y 488
*   `DebtorType`: String, Este campo retorna el tipo de documento del pagador cuando la transaccion es de tipo 388

**Body** (raw (json))
```json
{ 
  "ClientID": "J000121532",
  "AccountNumber": "01910001482101010049",
  "Reference": "40067",
  "Amount": 101.00,
  "DateMovement": "2025-10-21",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Example Request (cURL)**
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Position/Validate',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{ 
  "ClientID": "F500050005",
  "AccountNumber": "01910095202195016021",
  "Reference": "160",
  "Amount": 1.31,
  "DateMovement": "2024-08-14T00:00:00",
  "ChildClientID": "",
  "BranchID": ""
}
',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)
```json
//value desencriptado: {"MovementExists":false,"Date":"","ControlNumber":"","Amount":0.0,"BankCode":"","Code":"","DebtorInstrument":null,"Concept":"","DebitAccount":null,"Type":"","BalanceDelta":"","ReferenceA":"","ReferenceB":"","ReferenceC":"","ReferenceD":""}

{
    "status": "OK",
    "message": "000000Consulta exitosa",
    "value": "VdCgV2fbVttkNnYNn4eyHvDRVUwy5bxSxuFGFBLPuliSnBSTNeh4Y5iSc/kumxMLLsh3uHzdeDIesgg2WQQMHDwjM3/5T1CDfVvOmbGM6QyUopTY3WkIbnXsiCJu7/PEJ2ZzkhgyEwKw4fz/euriWZgQCrlKS7uE+2JQfTvdZRQwNBYrRoxIt4n7hoAU+ziJT3sVgzOVAk+uD6V3Puu4kDUPnGqFEW5roA73eczcFviU/jN/GLa26qrMGam7Jm22BVeucFKVtc74HwbcKyykfMUUBrTPyOlMKdXx2FYPP7020txsQQ/JX57s+SthvlWhtb55LYd26wZ0YhfLIeK4azOphIJRwfpH77Y7u4nS44Q7Vd/IjG/E7nkXk7NGgT/beppqwAlDF/oerCVZHbWBelB9xTRKq7XuykSnQqpBfgFmUzQUEXGf+YLf3ijA2tN+BFjfeYWaoChRjzBo78UpU8iBSYNv6NkFvhv1XKWRLzW1kKXX4FiXOFFOg7MmvR9r2Z0ft0SAK9gksNxWpeeTzcUo6z0wSzIHjBJxzIEsbbkIycP2Brqp201z+GmETyjW4wnPlWxqECFNRYy/V7oREV5xTRIpzv3cx+AkaHX70/0wVnbg8Z51OilkvNZDE1MT",
    "validation": "3f205aebabc168ccca1168cfdf2e6ae2b2037b06dfd4ed15e178a0e430953d92"
}
```

### POST: Validar Operaciones sin Referencia

`https://servicios.bncenlinea.com:16500/api/Position/ValidateExistence`

Consulta de movimiento P2P sin referencia.

**Parámetros de la transacción:**

*   `AccountNumber`*: String, es el número de cuenta del cliente solicitante.
*   `Amount`: Decimal (13,2), es el monto de la operación.
*   `BankCode`*: Int 32bits, es el código del banco deudor. Ejemplo: `191`
*   `ClientID`*: es el documento de identidad del cliente afiliado al API, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `J012345678`.
*   `PhoneNumber`*: String, es el número de teléfono con código de país del que está pagando. Ejemplo: `584241234567`.
*   `RequestDate`*: Objeto DateTime; es la fecha del día del pago en formato `"yyyy/M/dThh:mm:ss"`.
*   `ChildClientID`: String, es el documento de identidad del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal, conformado por el tipo de identificación seguido de 9 dígitos para el número de identificación. Ejemplo: `J012345678`. En caso de no enviarlo y quedar `null`, se utilizará los datos del beneficiario que correspondan al GUID.
*   `BranchID`: String, es el código asignado a la sucursal del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal. Ejemplo: `CCS001`. En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al `ChildClientID` por defecto. Debe enviarse el `ChildClientID` para funcionar correctamente.

**Parámetros de respuesta de la transacción:**

*   `Amount`: Decimal, monto de la transacción.
*   `BalanceDelta`: String, indica si es un ingreso o egreso.
*   `Code`: String, código de operación.
*   `ControlNumber`: String, número de control de la transacción.
*   `Date`: fecha del movimiento en formato `dd/MM/yyyy`.
*   `Concept`: String, descripción.
*   `DebitAccount`: String, número de cuenta de 20 dígitos.
*   `BankCode`: Int, es el código del banco.
*   `MovementExists`: Bool, este campo indica si existe o no el movimiento.
*   `ReferenceA`: String, referencia 1.
*   `ReferenceB`: String, referencia 2. Este campo puede no tener valor, depende del tipo de movimiento.
*   `ReferenceC`: String, referencia 3. Este campo puede no tener valor, depende del tipo de movimiento.
*   `ReferenceD`: String, referencia 4. Este campo puede no tener valor, depende del tipo de movimiento.
*   `Type`: String, tipo de movimiento.
*   `DebtorID`: String, Este campo retorna el numero de documento del pagador cuando la transaccion es de tipo 388 y 488
*   `DebtorType`: String, Este campo retorna el tipo de documento del pagador cuando la transaccion es de tipo 388

| Ejemplo (Value) |
| :--- |
| `{"Date":null,"ControlNumber":null,"Amount":0.0,"MovementExists":false,"Code":null,"BankCode":null,"Concept":null,"Type":null,"BalanceDelta":null,"ReferenceA":null,"ReferenceB":null,"ReferenceC":null,"ReferenceD":null}` |

**Body** (raw (json))
```json
{ 
  "AccountNumber":"01910001482101010049",
  "BankCode":191,
  "PhoneNumber":"584128021120",
  "ClientID":"J000121532",
  "RequestDate":"2025-01-07",
  "Amount":10.01,
  "ChildClientID": "",
  "BranchID": ""
}
```

**Example Request (cURL)**
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Position/ValidateExistence',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{ 
  "AccountNumber": "01910095202195016021",
  "BankCode": 191,
  "PhoneNumber": "584242207524",
  "ClientID": "F500050005",
  "RequestDate": "2024-08-12T00:00:00",
  "Amount": 0.1,
  "ChildClientID":"",
  "BranchID": ""
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)
```json
//value: {"Date":null,"ControlNumber":null,"Amount":0.0,"MovementExists":false,"Code":null,"BankCode":null,"Concept":null,"Type":null,"BalanceDelta":null,"ReferenceA":null,"ReferenceB":null,"ReferenceC":null,"ReferenceD":null}

{
  "status": "OK",
  "message": "000000Consulta exitosa",
  "value": "pN14IKTl8gYj1KPu/Vgo4aCKPjKK2Bks6YqknnQLQb+Tstg/FDdTCB/h/FnnJIsK5asZGp4x1q8ASeW2gRduB5LGEO7wShZ9a0FWHhEd0Nphvlsz3iujDqyHS3By+obpy+0qPhdp7SvbPwxTixMKu/z9xI0tTuPhpXZwT/NZyDKnotgQEyw5GlfgkmnST4kvI1JX4rKuQlZNtEE/eT7HvKfzm6zQV2+cDuReHHXR8cjqT/zOU4o+zZiHT0Q3hGsAWKwXNrzVUdENrYpMqbFiS+kRluaH4a98DXixfKmX6bg8oxzB6XUVUDlrulKoyU7+2DP0AWsSZb/iFpaB+AAxMsxDMAZ98EMtNz7nnTwNMv/pq6LBP9wH4loyVhtO6x6Ou8tvHdQLDfXws5Ze6WIP+0rcrck4eWHXq2OBIFmD5zCJl7WN7XVYfu0uOta4W5FGo+z4PR5DIIWSR1nKrQHJ+fQIcXMIqQEWtzlkIojxNlDqatBYADLagpBWtzSwdODN1luRWV3BNEeg9Up6xf2EOCQDXXP7a8egh+FkqMC0w0hn+kwP0TP5y/mYrAw+NuTIT2JNmroO6Lh4h+BlfsNBcw==",
  "validation": "88ef8de9cbf4732c74d875d276f4b91cd22cdd75886fc3bb6075fef5ba26b737"
}
```

## VPOS

*(No se proporcionó documentación detallada para VPOS en el texto)*

## Consultas

### POST: Consultar Saldo

*(No se proporcionó *endpoint* o estructura específica en la documentación original)*

### POST: Historial (Ultimos 3 Dias)

`https://servicios.bncenlinea.com:16500/api/Position/History`

**Parámetros de la transacción:**

*   `ClientID`*: String, es el documento de identidad del cliente afiliado al API, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `J012345678`.
*   `AccountNumber`*: String, número de cuenta de 20 dígitos del cliente afiliado al API.
*   `ChildClientID`: String, es el documento de identidad del cliente afiliado al API, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `V012345678`. En caso de no enviarlo y quedar `null`, se utilizarán los datos del cliente afiliado al API que correspondan al GUID.
*   `BranchID`: String, es el código asignado a la sucursal del deudor para ser usado exclusivamente por aquella empresa que utilice la API a través de un cliente principal. Ejemplo: `CCS001`. En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al `ChildClientID` por defecto. Debe enviarse el `ChildClientID` para funcionar correctamente.

**Parámetros de respuesta de la transacción:**

Diccionario con las siguientes propiedades:

*   **Key**: Número de cuenta.
*   **Value**: Lista de movimientos de los 3 días más recientes con los campos:
    *   `Date`: fecha del movimiento en formato `dd/MM/yyyy`.
    *   `ControlNumber`: String, número de control de la transacción.
    *   `Amount`: Decimal, monto de la transacción.
    *   `Code`: String, código de operación.
    *   `DebtorInstrument`: Instrumento con el que se opera.
    *   `Concept`: String, descripción.
    *   `BankCode`: String/Int, código del banco.
    *   `Type`: String, tipo de movimiento.
    *   `BalanceDelta`: String, indica si es un ingreso o egreso.
    *   `ReferenceA`–`ReferenceD`: Strings de referencias adicionales.

| Ejemplo (Value desencriptado) |
| :--- |
| Lista de movimientos con campos `Date`, `ControlNumber`, `Amount`, `Code`, `BankCode`, `DebtorInstrument`, `Concept`, `Type`, `BalanceDelta`, `ReferenceA`–`ReferenceD`. |

**Body** (raw (json))  
```json
{
  "ClientID": "J000121532",
  "AccountNumber": "01910001482101010049",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Example Request (cURL)**  
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Position/History',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{
  "ClientID": "F500050005",
  "AccountNumber": "01910095202195016021",
  "ChildClientID": "", 
  "BranchID": ""
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)  
```json
// value desencriptado: lista de movimientos de los últimos 3 días
{
  "status": "OK",
  "message": "000000Consulta exitosa",
  "value": "YFBqjiAxkroLYObs9okOWMjYY4A9PZedBZUNWIKvFwiaqqzrqQL52ut2dIzIAl3AxrFFyOreNYOSBGA06OpIBmJ9ZLRQTFBZvKNTOaiNY8MooB4osYlkhdel2hb52XB4W13NJA9+3XFRXgf1YT08IGTuFx7y9qQoyMi/lQTKkbmjHzxAQGsKb71rRlwL9U6KFxAR6gDl646aYNhaQVzt5qeGNP52U6uQRxibWdM3GPwRvZ9z8U/gCOuxD6Zmsd+2fCprurs9m2ES/q1DUrRCwx6epKhPiYMp9t6pxvnGyCMu2XeUiSLFbIJjgktZHG1eK1RrHXLvDfJIeIRu2PSrS4XuBnj32B2JX60cPSrG7GdX6jxYlojNIRRCZWpgjB1FWF4n5RSDxJRuHoRbE1RH70d6rGW2B1nD6YSliAn8OXFu8A1Qi7l8arcf8SIFVnszT/KZQQjtXE9mn2+cfJ/IedcjNPUcmXbDuHCBH98D7H8i94B99Gcj41EgK6KnO7JLLC86NFLPJANVWTRNSewrMI5WCU0S33wUwdv12piDM8rJzEx9rqPa2ztDP60ix6rMMfdE0lcUImfkOsLyGM=",
  "validation": "fa774ff6e257d8e37b3ee17e2669134a734fb9a7dc1cc291780a981892d8ab16"
}
```

### POST: Historial por fecha (máx 31 días)

`https://servicios.bncenlinea.com:16500/api/Position/HistoryByDate`

**Parámetros de la transacción:**

*   `AccountNumber`*: String, es el número de cuenta del cliente afiliado al API.
*   `ClientID`*: String, es el documento de identidad del cliente afiliado al API, conformado por el tipo de identificación seguido de hasta 9 dígitos para el número de identificación. Ejemplo: `J012345678`.
*   `StartDate`*: DateTime, fecha inicial del rango de consulta en formato `"yyyy/M/dThh:mm:ss"`.
*   `EndDate`*: DateTime, fecha final del rango de consulta en formato `"yyyy/M/dThh:mm:ss"`.
*   `ChildClientID`: String, documento de identidad del cliente afiliado al API para uso en esquemas Padre/Hijo. En caso de no enviarlo y quedar `null`, se utilizarán los datos del cliente afiliado al API que correspondan al GUID.
*   `BranchID`: String, código asignado a la sucursal del deudor para esquemas Padre/Hijo. En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al `ChildClientID` por defecto.

**Parámetros de respuesta de la transacción:**

Diccionario con las siguientes propiedades:

*   **Key**: Número de cuenta del cliente afiliado al API.
*   **Value**: Lista de movimientos dentro del rango con:
    *   `Date`: `dd/MM/aaaa`.
    *   `ControlNumber`: String, número de control.
    *   `Amount`: Decimal, monto.
    *   `Code`: String, código de operación.
    *   `DebtorInstrument`: Instrumento con el que se opera.
    *   `Concept`: String, concepto (hasta 100 caracteres).
    *   `BankCode`: Int, código del banco.
    *   `Type`: String, tipo de movimiento.
    *   `BalanceDelta`: String, indica ingreso o egreso.
    *   `ReferenceA`–`ReferenceD`: Strings de referencias adicionales.

**Body** (raw (json))  
```json
{ 
  "ClientID": "J000121532",
  "AccountNumber": "01910001482101010049",
  "StartDate": "2024-05-09",
  "EndDate": "2024-06-08",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Example Request (cURL)**  
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Position/HistoryByDate',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{ 
  "ClientID": "F500050005",
  "AccountNumber": "01910095202195016021",
  "StartDate": "2024-08-01T00:00:00",
  "EndDate": "2024-08-02T00:00:00",
  "ChildClientID": "", 
  "BranchID": ""
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)  
```json
// value desencriptado: lista de movimientos dentro del rango de fechas solicitado
{
  "status": "OK",
  "message": "000000Consulta exitosa",
  "value": "YFBqjiAxkroLYObs9okOWMjYY4A9PZedBZUNWIKvFwiaqqzrqQL52ut2dIzIAl3AxrFFyOreNYOSBGA06OpIBmJ9ZLRQTFBZvKNTOaiNY8MooB4osYlkhdel2hb52XB4W13NJA9+3XFRXgf1YT08IGTuFx7y9qQoyMi/lQTKkbmjHzxAQGsKb71rRlwL9U6KFxAR6gDl646aYNhaQVzt5qeGNP52U6uQRxibWdM3GPwRvZ9z8U/gCOuxD6Zmsd+2fCprurs9m2ES/q1DUrRCwx6epKhPiYMp9t6pxvnGyCMu2XeUiSLFbIJjgktZHG1eK1RrHXLvDfJIeIRu2PSrS4XuBnj32B2JX60cPSrG7GdX6jxYlojNIRRCZWpgjB1FWF4n5RSDxJRuHoRbE1RH70d6rGW2B1nD6YSliAn8OXFu8A1Qi7l8arcf8SIFVnszT/KZQQjtXE9mn2+cfJ/IedcjNPUcmXbDuHCBH98D7H8i94B99Gcj41EgK6KnO7JLLC86NFLPJANVWTRNSewrMI5WCU0S33wUwdv12piDM8rJzEx9rqPa2ztDP60ix6rMMfdE0lcUImfkOsLyGM=",
  "validation": "fa774ff6e257d8e37b3ee17e2669134a734fb9a7dc1cc291780a981892d8ab16"
}
```

### POST: Tasa BCV del Dia

`https://servicios.bncenlinea.com:16500/api/Services/BCVRates`

**Parámetros de la transacción:**

*   Objeto vacío `{}`.

**Parámetros de respuesta de la transacción:**

*   `PriceRateBCV`: Decimal, tasa en bolívares del dólar.
*   `dtRate`: String, fecha de la tasa en formato `dd/MM/yyyy`.

**Body** (raw (json))  
```json
{}
```

**Example Request (cURL)**  
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Services/BCVRates',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)  
```json
// value desencriptado: {"PriceRateBCV":36.66420000,"dtRate":"07/08/2024"}
{
  "status": "OK",
  "message": "000000Consulta exitosa",
  "value": "WfzgbRyQEvBtYajW96mDNqVFFcfpe6Ox9G81qLXHvj3WMwfkiqKSBtNrEadzyrFmYK+QUSOfNHkYbOTRnP1KfSE+p7qgkvk7bHuuOrrJXgWn4WJ/kOI9AWmjGZpXafIivvG5uYawxMOoPzZ32ocYfA==",
  "validation": "4aa6fe4be956d615886f2328d8ad7fcc370f6cf972a5ddfa28ca3c4844dee526"
}
```

### POST: Lista de Bancos Disponibles

`https://servicios.bncenlinea.com:16500/api/Services/Banks`

**Parámetros de la transacción:**

*   Objeto vacío `{}`.

**Parámetros de respuesta de la transacción:**

*   Lista de objetos con:
    *   `Name`: String, nombre corto de la institución. Ejemplo: `Banco Nacional de Crédito, C.A. Banco Universal`.
    *   `Code`: String, código de la institución. Ejemplo: `0191`.
    *   `Services`: String, instrumentos con los que opera la institución. Ejemplo: `"TRF, P2P"`.

**Body** (raw (json))  
```json
{}
```

**Example Request (cURL)**  
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Services/Banks',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)  
```json
// value desencriptado: lista de bancos con Name, Code y Services
{
  "status": "OK",
  "message": "000000Consulta exitosa",
  "value": "EHjMibEB42bikJAQfL1anPZ0VphziejAsioEYd2a44Z/7JZrxmg3G/eCjn114Z6QzaqazApvRpIcAFB9xhbOCMXzRsabsLdyGP+h2tlGfUWQyM52rG7RVb7v1QbKAFKXA9eGrSzT5AdMIoZgjIcpuOtMu74AY4MHmrrhzV40M60xr/MQlWa9T6ixw0uA03quEm8Pe35f+0yZmNvzcMlTWPv5HEM=",
  "validation": "38f1e7a4000193ab28c759e0950e48fdbabce37677f8830d78141c52019f15c6"
}
```

### POST: Consulta de Operaciones POS Fisicos

`https://servicios.bncenlinea.com:16500/api/Position/TransactionsPOS`

**Parámetros de la transacción:**

*   `Terminal`*: String, de 8 caracteres. Puede ser `null`.
*   `dtTransaction`*: DateTime, fecha del movimiento en formato `"yyyy/MM/ddThh:mm:ss"` de la operación a consultar.
*   `ChildClientID`: String, documento de identidad del deudor para esquemas Padre/Hijo. En caso de no enviarlo y quedar `null`, se usarán los datos del beneficiario que correspondan al GUID.
*   `BranchID`: String, código asignado a la sucursal del deudor para esquemas Padre/Hijo. En caso de no enviarlo, se utilizarán los datos del deudor que correspondan al `ChildClientID` por defecto. Debe enviarse el `ChildClientID` para funcionar correctamente.

**Parámetros de respuesta de la transacción:**

Diccionario con las siguientes propiedades:

*   `dtPayment`: fecha de liquidación en formato `dd/MM/yyyy`.
*   `dtTrasaction`: fecha del movimiento en formato `dd/MM/yyyy`.
*   `idPOS`: String, número de afiliación.
*   `Amount`: Decimal, monto de la transacción.
*   `AuthorizationNumber`: String, número de autorización.
*   `idLot`: String, identificador del lote.
*   `CardType`: String, tipo de tarjeta.
*   `idAccount`: String, número de cuenta del cliente asociado al POS físico.
*   `ComissionAmount`: Decimal, monto de la comisión.
*   `LockedAmount`: Decimal, monto bloqueado.
*   `CardNumber`: String, número de tarjeta.
*   `Reference`: String, referencia.
*   `idTerminal`: String, terminal asociado.
*   `HourTransaction`: String, hora de la transacción.

**Body** (raw (json))  
```json
{
  "Terminal": "15015840",
  "dtTransaction": "2024-08-07",
  "ChildClientID": "",
  "BranchID": ""
}
```

**Example Request (cURL)**  
```php
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://servicios.bncenlinea.com:16500/api/Position/TransactionsPOS',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS =>'{
  "Terminal": "15015840",
  "dtTransaction": "2024-08-07",
  "ChildClientID": "", 
  "BranchID": ""
}',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;
```

**Example Response** (Body)  
La documentación de ejemplo indica que este servicio puede no devolver respuesta en algunos escenarios de prueba.

### POST: Consultar Saldo Data completa

*(No se proporcionó *endpoint* o estructura específica en la documentación original)*

### POST: Historial Por Numero de Control (Fecha Actual)

*(No se proporcionó *endpoint* o estructura específica en la documentación original)*

### POST: Historial diario (Dias Anteriores)

*(No se proporcionó *endpoint* o estructura específica en la documentación original)*

## Validaciones

### Gestor de Asociados

*(No se proporcionó documentación detallada)*

### Crédito inmediato (Pagar)

*(Se listan códigos de error, ver sección "Crédito inmediato" en "Códigos y mensajes de error")*

### Debito inmediato (Cobrar)

*(Se listan códigos de error, ver sección "Débito inmediato" en "Códigos y mensajes de error")*