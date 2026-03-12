---
name: read-project-context
description: Reads the API BNC frontend/backend project context from .cursor/rules/project-context.mdc. Use whenever working in this repository, especially before answering questions about API routes, authentication, or frontend-backend contracts.
---

# Read Project Context for API BNC

## Instructions

When working in this repository:

1. **Always read the main project context file** before performing non-trivial tasks related to the API or frontend:
   - Path: `.cursor/rules/project-context.mdc`
   - Use the `Read` tool with the absolute path:
     - `c:\\Users\\leonardoe.urdaneta\\Desktop\\Leonardo\\Api-BNC\\api-bnc-frontend\\.cursor\\rules\\project-context.mdc`

2. **When to apply this skill**
   - When the user asks about:
     - API endpoints (`/api/auth`, `/api/account`, `/api/bank-accounts`, `/api/transactions`, `/api/associates`, etc.).
     - Authentication, JWT usage, or headers for protected routes.
     - Contracts between frontend and backend (request/response shapes).
     - Error handling conventions or HTTP status codes in this project.
   - When implementing or modifying:
     - Frontend code that consumes the API BNC backend.
     - Backend code that must follow the documented contracts.

3. **How to use the context**
   - Treat `project-context.mdc` as the **single source of truth** for:
     - Available endpoints and paths.
     - Request body and query parameter structures.
     - Expected response formats and status codes.
     - Authentication requirements (which endpoints require JWT, which do not).
   - Do **not** change endpoint contracts (paths, params, response shapes) unless:
     - The user explicitly requests a contract change.
     - You also update `project-context.mdc` accordingly.

4. **Reading strategy**
   - For new sessions or large tasks, read the full file once at the beginning.
   - For smaller follow-up questions, you may:
     - Rely on previously loaded context, or
     - Re-read only if you are uncertain about a specific detail.
   - When referring to details (e.g., body schema for `/api/account/history-by-date-simple`), quote the relevant snippet or summarize it accurately for the user.

5. **Frontend usage guidelines**
   - When implementing frontend calls:
     - Always consult `project-context.mdc` to confirm:
       - HTTP method and path.
       - Required headers (especially `Authorization: Bearer <jwt-token>`).
       - Request body schema and optional fields.
     - Centralize API calls in reusable services or hooks instead of calling the API directly from UI components, following the project rules.
   - When handling errors in the UI:
     - Use the `message` field from the JSON error response as the main human-readable error to show or log, as documented.

6. **Backend usage guidelines**
   - When modifying backend routes under `api-bnc-backend/`:
     - Ensure they continue to match the contracts described in `project-context.mdc`.
     - If you introduce new routes or parameters, update `project-context.mdc` first and keep the documentation in sync.

7. **Language and communication**
   - Always answer in Spanish in this project.
   - When explaining API usage, prefer clear JSON and HTTP examples, aligned with `project-context.mdc`.

## Examples

### Example 1: Implementing frontend login

1. Read `project-context.mdc`.
2. Locate the **"Login local (JWT)"** section (`POST /api/auth/login-token`).
3. Implement a frontend function that:
   - Sends `username` and `password` in the body.
   - Reads `token`, `tokenType`, and `expiresIn` from the response.
   - Stores and later sends `Authorization: Bearer <token>` for protected endpoints.

### Example 2: Creating a screen for `/api/account/history-by-date-simple`

1. Read `project-context.mdc` and find the "Historial por rango de fechas simple" section.
2. Use the documented body:
   - `accountNumber`, `startDate`, `endDate`, `workingKey`, and optional IDs.
3. Build a form in the frontend that collects these fields and calls the endpoint exactly as specified.

