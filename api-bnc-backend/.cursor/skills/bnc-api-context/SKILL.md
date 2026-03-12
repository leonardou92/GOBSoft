---
name: bnc-api-context
description: Use the BNC API PROJECT_CONTEXT.mdc as the primary reference for encryption, request/response structure, and integration rules. Apply this skill when working on the Banco Nacional de Crédito integration, cryptographic flows (AES, SHA256, PBKDF2), or any backend endpoints that call the BNC API in this project.
---

# BNC API Context

## Objetivo

Esta skill asegura que, al trabajar en este repositorio con la integración del **Banco Nacional de Crédito (BNC)**, el asistente:

- Lea y tenga presente el contenido de `PROJECT_CONTEXT.mdc`.
- Respete el modelo criptográfico, la forma de los requests/responses y las reglas de seguridad definidas allí.

## Instrucciones para el asistente

Cuando estés trabajando en este proyecto (`api-bnc-backend`) y se mencionen temas como:

- Integración con la **API del BNC**.
- Encriptación/Desencriptación (`AES`, `SHA256`, `PBKDF2`, `MasterKey`, `WorkingKey`).
- Construcción de **requests** o parseo de **responses** del BNC.
- Endpoints backend que llamen a servicios tipo `/Position/*`, `/Services/*`, Pago Móvil, VPOS, créditos/débitos inmediatos.

DEBES seguir estos pasos:

1. **Leer el contexto oficial del BNC**  
   - Usa la herramienta de lectura para cargar siempre que sea necesario:  
     - `.cursor/rules/PROJECT_CONTEXT.mdc`
   - Considera ese archivo como **fuente de verdad** para:
     - Modelo de request/response (envoltorio con `ClientGUID`, `Reference`, `Value`, `Validation`, `swTestOperation`).
     - Modelo criptográfico (AES Rijndael, SHA256, PBKDF2, UTF-16LE, salt fijo, derivación de key/IV).
     - Uso de `ClientGUID`, `ClientID`, `ChildClientID`, `BranchID`.

2. **No reinventar la criptografía**  
   - No propongas algoritmos distintos a los descritos en `PROJECT_CONTEXT.mdc` para hablar con el BNC.
   - Si necesitas ejemplos de implementación, apóyate en el código de ejemplo (como la clase `DataCypher`) presente en `PROJECT_CONTEXT.mdc` y adáptalo al lenguaje del backend solo cuando haga falta.

3. **Respetar la estructura de integración**  
   - Cuando diseñes o modifiques endpoints del backend que llamen al BNC:
     - Asegúrate de construir el **request interno** y luego el **envoltorio** tal como está descrito en `PROJECT_CONTEXT.mdc`.
     - Asegúrate de validar y desencriptar la respuesta siguiendo el mismo esquema.

4. **Seguridad y datos sensibles**  
   - Nunca sugieras hardcodear ni exponer en código o documentación:
     - `ClientGUID` reales.
     - `MasterKey`, `WorkingKey`, `ClientID` reales ni afiliaciones.
   - Siempre recomienda el uso de:
     - Variables de entorno (`.env`) para este backend.
   - Usa **ejemplos ficticios** para cualquier demostración.

5. **Coherencia con documentación existente**  
   - Si hay conflicto entre suposiciones genéricas y lo que indica `PROJECT_CONTEXT.mdc`, **prioriza siempre lo que diga ese archivo**.
   - Cuando haga falta más contexto funcional, también puedes consultar `README.md` del proyecto, pero sin contradecir `PROJECT_CONTEXT.mdc`.

## Ejemplos de uso de esta skill

- El usuario pide: “Implementa el flujo de Logon contra el BNC”.  
  - Antes de escribir código, lee `PROJECT_CONTEXT.mdc` y replica el esquema de Logon (uso de `MasterKey`, estructura del `Value`, `Validation`, etc.).

- El usuario pide: “Crea un endpoint para consultar saldo usando la API del BNC”.  
  - Usa la sección de `POST /Position/Current` en `PROJECT_CONTEXT.mdc` para:
    - Armar el body interno correcto.
    - Encriptarlo y envolverlo según el modelo descrito.
    - Desencriptar y exponer la respuesta de forma segura al frontend.

- El usuario pide: “Ayúdame a interpretar este código de error del BNC”.  
  - Usa la sección de **códigos y mensajes de error** en `PROJECT_CONTEXT.mdc` como referencia principal para explicar el significado y posibles acciones.

