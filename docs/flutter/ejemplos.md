# Ejemplos de peticiones y respuestas

Generados automáticamente con las respuestas **reales** del servidor (`UPDATE_EXAMPLES=1 npm run test:db -- tests/consumer` en `backend/`).
Los identificadores, fechas y números de pedido cambian en cada ejecución; la forma, no.
Las listas largas se acortan con «… (N más)». `$API` es la URL base, por ejemplo `https://api.forno.ejemplo/api/v1`;
`$TOKEN` es el access token de Supabase de la persona que ha iniciado sesión.

## Carta (pública)

`getProducts` → `GET /api/v1/products`

```bash
curl -X GET "$API/products" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": [
    {
      "id": "136a05d5-bcc8-497b-9fc9-c43446598e7b",
      "slug": "margherita",
      "categoryId": "8b824ff6-7360-47f4-94c4-01a8a7326e68",
      "categorySlug": "pizzas",
      "name": "Margherita",
      "description": "La clásica: sencilla, intensa y siempre acertada.",
      "price": "9.50",
      "taxRate": "10.00",
      "vegetarian": true,
      "available": true,
      "popular": true,
      "image": {
        "url": "/image/pizza-margherita-tabla.webp",
        "alt": "",
        "isPrimary": true
      },
      "images": [
        {
          "url": "/image/pizza-margherita-tabla.webp",
          "alt": "",
          "isPrimary": true
        }
      ],
      "ingredients": [
        "Tomate San Marzano",
        "Mozzarella fior di latte",
        "… (2 más)"
      ],
      "allergens": [
        {
          "code": "gluten",
          "name": "Gluten"
        },
        {
          "code": "lacteos",
          "name": "Lácteos"
        }
      ],
      "optionGroups": [
        {
          "id": "2ee9af3d-d69b-4305-9c86-116036c45661",
          "name": "Tamaño",
          "kind": "SIZE",
          "required": true,
          "minSelect": 1,
          "maxSelect": 1,
          "options": [
            {
              "id": "5aef5106-c212-4716-8033-ca3708c761d6",
              "name": "Mediana",
              "priceDelta": "0.00",
              "isDefault": true,
              "available": true
            },
            {
              "id": "1655f333-f512-42f7-abd3-849803c0da74",
              "name": "Familiar",
              "priceDelta": "4.00",
              "isDefault": false,
              "available": true
            }
          ]
        },
        {
          "id": "1370adc3-d2b3-4568-9bdc-910ee5636b2e",
          "name": "Tipo de masa",
          "kind": "DOUGH",
          "required": true,
          "minSelect": 1,
          "maxSelect": 1,
          "options": [
            {
              "id": "c10f9f75-e418-4b21-b731-7b644898da93",
              "name": "Clásica",
              "priceDelta": "0.00",
              "isDefault": true,
              "available": true
            },
            {
              "id": "bb140398-28ae-4aa0-b242-de741574c8ba",
              "name": "Integral",
              "priceDelta": "1.00",
              "isDefault": false,
              "available": true
            },
            "… (1 más)"
          ]
        },
        "… (1 más)"
      ]
    },
    {
      "id": "91c8e422-49f2-4d38-89b6-1c5b2d1bca8f",
      "slug": "diavola",
      "categoryId": "8b824ff6-7360-47f4-94c4-01a8a7326e68",
      "categorySlug": "pizzas",
      "name": "Diavola",
      "description": "Con carácter: salame picante y un toque de guindilla.",
      "price": "11.50",
      "taxRate": "10.00",
      "vegetarian": false,
      "available": true,
      "popular": true,
      "image": {
        "url": "/image/pizza-diavola.webp",
        "alt": "",
        "isPrimary": true
      },
      "images": [
        {
          "url": "/image/pizza-diavola.webp",
          "alt": "",
          "isPrimary": true
        }
      ],
      "ingredients": ["Tomate", "Mozzarella", "… (2 más)"],
      "allergens": [
        {
          "code": "gluten",
          "name": "Gluten"
        },
        {
          "code": "lacteos",
          "name": "Lácteos"
        }
      ],
      "optionGroups": [
        {
          "id": "bff0ad81-8381-48c9-94f6-7237c1a42a1d",
          "name": "Tamaño",
          "kind": "SIZE",
          "required": true,
          "minSelect": 1,
          "maxSelect": 1,
          "options": [
            {
              "id": "4e316d65-f6e5-4669-831f-7fe644593b6d",
              "name": "Mediana",
              "priceDelta": "0.00",
              "isDefault": true,
              "available": true
            },
            {
              "id": "5c726bce-365e-4bc5-b769-d21b8c3de5a1",
              "name": "Familiar",
              "priceDelta": "4.00",
              "isDefault": false,
              "available": true
            }
          ]
        },
        {
          "id": "91be7b23-ab23-4ab4-a564-84b0aff1558e",
          "name": "Tipo de masa",
          "kind": "DOUGH",
          "required": true,
          "minSelect": 1,
          "maxSelect": 1,
          "options": [
            {
              "id": "598859d7-6382-4e94-8b2d-a5f271efe446",
              "name": "Clásica",
              "priceDelta": "0.00",
              "isDefault": true,
              "available": true
            },
            {
              "id": "80ecb3ee-cad3-46ee-9a56-b550f26cf3e1",
              "name": "Integral",
              "priceDelta": "1.00",
              "isDefault": false,
              "available": true
            },
            "… (1 más)"
          ]
        },
        "… (1 más)"
      ]
    },
    "… (13 más)"
  ]
}
```

## Producto con opciones, ingredientes y alérgenos (pública)

`getProductsByIdOrSlug` → `GET /api/v1/products/margherita`

```bash
curl -X GET "$API/products/margherita" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "id": "136a05d5-bcc8-497b-9fc9-c43446598e7b",
    "slug": "margherita",
    "categoryId": "8b824ff6-7360-47f4-94c4-01a8a7326e68",
    "categorySlug": "pizzas",
    "name": "Margherita",
    "description": "La clásica: sencilla, intensa y siempre acertada.",
    "price": "9.50",
    "taxRate": "10.00",
    "vegetarian": true,
    "available": true,
    "popular": true,
    "image": {
      "url": "/image/pizza-margherita-tabla.webp",
      "alt": "",
      "isPrimary": true
    },
    "images": [
      {
        "url": "/image/pizza-margherita-tabla.webp",
        "alt": "",
        "isPrimary": true
      }
    ],
    "ingredients": [
      "Tomate San Marzano",
      "Mozzarella fior di latte",
      "… (2 más)"
    ],
    "allergens": [
      {
        "code": "gluten",
        "name": "Gluten"
      },
      {
        "code": "lacteos",
        "name": "Lácteos"
      }
    ],
    "optionGroups": [
      {
        "id": "2ee9af3d-d69b-4305-9c86-116036c45661",
        "name": "Tamaño",
        "kind": "SIZE",
        "required": true,
        "minSelect": 1,
        "maxSelect": 1,
        "options": [
          {
            "id": "5aef5106-c212-4716-8033-ca3708c761d6",
            "name": "Mediana",
            "priceDelta": "0.00",
            "isDefault": true,
            "available": true
          },
          {
            "id": "1655f333-f512-42f7-abd3-849803c0da74",
            "name": "Familiar",
            "priceDelta": "4.00",
            "isDefault": false,
            "available": true
          }
        ]
      },
      {
        "id": "1370adc3-d2b3-4568-9bdc-910ee5636b2e",
        "name": "Tipo de masa",
        "kind": "DOUGH",
        "required": true,
        "minSelect": 1,
        "maxSelect": 1,
        "options": [
          {
            "id": "c10f9f75-e418-4b21-b731-7b644898da93",
            "name": "Clásica",
            "priceDelta": "0.00",
            "isDefault": true,
            "available": true
          },
          {
            "id": "bb140398-28ae-4aa0-b242-de741574c8ba",
            "name": "Integral",
            "priceDelta": "1.00",
            "isDefault": false,
            "available": true
          },
          "… (1 más)"
        ]
      },
      "… (1 más)"
    ]
  }
}
```

## Presupuesto del carrito (pública): el servidor calcula todos los importes

`postCheckoutQuote` → `POST /api/v1/checkout/quote`

```bash
curl -X POST "$API/checkout/quote" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"136a05d5-bcc8-497b-9fc9-c43446598e7b","quantity":2,"optionIds":["5aef5106-c212-4716-8033-ca3708c761d6","c10f9f75-e418-4b21-b731-7b644898da93"]}],"type":"PICKUP"}' \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "type": "PICKUP",
    "lines": [
      {
        "productId": "136a05d5-bcc8-497b-9fc9-c43446598e7b",
        "productName": "Margherita",
        "quantity": 2,
        "notes": null,
        "unitPrice": "9.50",
        "lineTotal": "19.00",
        "options": [
          {
            "optionId": "5aef5106-c212-4716-8033-ca3708c761d6",
            "group": "Tamaño",
            "name": "Mediana",
            "priceDelta": "0.00"
          },
          {
            "optionId": "c10f9f75-e418-4b21-b731-7b644898da93",
            "group": "Tipo de masa",
            "name": "Clásica",
            "priceDelta": "0.00"
          }
        ]
      }
    ],
    "discounts": [],
    "totals": {
      "subtotal": "19.00",
      "discount": "0.00",
      "deliveryFee": "0.00",
      "tax": "1.73",
      "total": "19.00"
    },
    "delivery": null,
    "estimatedMinutes": 20,
    "pointsToEarn": 19
  }
}
```

## Error sin sesión

`getMe` → `GET /api/v1/me`

```bash
curl -X GET "$API/me" \
  -H "Accept: application/json"
```

Respuesta `401`:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required",
    "requestId": "d7578616-9da8-4fea-871f-dc6b49df9dba"
  }
}
```

## Mi perfil (la primera llamada con sesión lo crea)

`getMe` → `GET /api/v1/me`

```bash
curl -X GET "$API/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "id": "96a0daf1-2a2e-48a7-b45f-01063a02a3cf",
    "email": "flutter@example.test",
    "fullName": "flutter",
    "username": null,
    "phone": null,
    "profileComplete": false,
    "marketingConsent": false,
    "roles": [],
    "permissions": ["addresses:manage:own", "loyalty:read:own", "… (5 más)"],
    "selfAdminAvailable": false,
    "createdAt": "2026-11-12T15:48:11.566Z"
  }
}
```

## Completar mis datos (necesario para pedir)

`patchMe` → `PATCH /api/v1/me`

```bash
curl -X PATCH "$API/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"flutter_1","phone":"+34 600 000 000","fullName":"Cliente Flutter"}' \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "id": "96a0daf1-2a2e-48a7-b45f-01063a02a3cf",
    "email": "flutter@example.test",
    "fullName": "Cliente Flutter",
    "username": "flutter_1",
    "phone": "+34 600 000 000",
    "profileComplete": true,
    "marketingConsent": false,
    "roles": [],
    "permissions": ["addresses:manage:own", "loyalty:read:own", "… (5 más)"],
    "selfAdminAvailable": false,
    "createdAt": "2026-11-12T15:48:13.949Z"
  }
}
```

## Añadir una dirección

`postMeAddresses` → `POST /api/v1/me/addresses`

```bash
curl -X POST "$API/me/addresses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Cliente","line1":"Calle Mayor 1","postalCode":"28001","city":"Madrid"}' \
  -H "Accept: application/json"
```

Respuesta `201`:

```json
{
  "data": {
    "id": "5c7ad241-aa1c-4954-bd00-5a90979cfbb7",
    "label": null,
    "recipientName": "Cliente",
    "phone": null,
    "line1": "Calle Mayor 1",
    "line2": null,
    "postalCode": "28001",
    "city": "Madrid",
    "province": null,
    "notes": null,
    "isDefault": true
  }
}
```

## Crear un pedido en efectivo (con `Idempotency-Key`)

`postOrders` → `POST /api/v1/orders`

```bash
curl -X POST "$API/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"548b1379-cfd7-430c-abf7-efb1787715e1","quantity":2,"optionIds":["8af93e76-74c5-4f2e-b468-64748707d727","37591495-df73-4bd7-92b1-f468e9856d5c"]}],"type":"PICKUP","paymentMethod":"CASH_PICKUP"}' \
  -H "Accept: application/json"
```

Respuesta `201`:

```json
{
  "data": {
    "id": "5963384d-6363-4cb7-ae4f-e06f932f48d5",
    "orderNumber": 1,
    "status": "NEW",
    "type": "PICKUP",
    "scheduledFor": null,
    "estimatedReadyAt": "2026-11-12T16:08:16.769Z",
    "notes": null,
    "createdAt": "2026-11-12T15:48:16.797Z",
    "delivery": null,
    "items": [
      {
        "id": "eff99384-6697-493f-869e-4fcc8981634f",
        "productName": "Margherita",
        "quantity": 2,
        "unitPrice": "9.50",
        "lineTotal": "19.00",
        "options": [
          {
            "group": "Tamaño",
            "name": "Mediana",
            "priceDelta": "0.00"
          },
          {
            "group": "Tipo de masa",
            "name": "Clásica",
            "priceDelta": "0.00"
          }
        ]
      }
    ],
    "discounts": [],
    "totals": {
      "subtotal": "19.00",
      "discount": "0.00",
      "deliveryFee": "0.00",
      "tax": "1.73",
      "total": "19.00"
    },
    "payments": [
      {
        "method": "CASH_PICKUP",
        "status": "CASH_PENDING",
        "amount": "19.00"
      }
    ],
    "history": [
      {
        "status": "NEW",
        "at": "2026-11-12T15:48:16.797Z"
      }
    ]
  }
}
```

## Error de validación: el cliente no puede enviar precios

`postOrders` → `POST /api/v1/orders`

```bash
curl -X POST "$API/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"items":[],"type":"PICKUP","paymentMethod":"CASH_PICKUP","total":"0.01"}' \
  -H "Accept: application/json"
```

Respuesta `400`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid",
    "details": [
      {
        "path": "items",
        "message": "Too small: expected array to have >=1 items"
      },
      {
        "path": "",
        "message": "Unrecognized key: \"total\""
      }
    ],
    "requestId": "7c429cf4-5aec-442d-a1fd-b4929118258b"
  }
}
```

## Mis pedidos (paginado)

`getOrdersMe` → `GET /api/v1/orders/me`

```bash
curl -X GET "$API/orders/me?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": [
    {
      "id": "5963384d-6363-4cb7-ae4f-e06f932f48d5",
      "orderNumber": 1,
      "status": "NEW",
      "type": "PICKUP",
      "total": "19.00",
      "itemCount": 2,
      "createdAt": "2026-11-12T15:48:16.797Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

## Detalle y seguimiento de un pedido

`getOrdersById` → `GET /api/v1/orders/5963384d-6363-4cb7-ae4f-e06f932f48d5`

```bash
curl -X GET "$API/orders/5963384d-6363-4cb7-ae4f-e06f932f48d5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "id": "5963384d-6363-4cb7-ae4f-e06f932f48d5",
    "orderNumber": 1,
    "status": "NEW",
    "type": "PICKUP",
    "scheduledFor": null,
    "estimatedReadyAt": "2026-11-12T16:08:16.769Z",
    "notes": null,
    "createdAt": "2026-11-12T15:48:16.797Z",
    "delivery": null,
    "items": [
      {
        "id": "eff99384-6697-493f-869e-4fcc8981634f",
        "productName": "Margherita",
        "quantity": 2,
        "unitPrice": "9.50",
        "lineTotal": "19.00",
        "options": [
          {
            "group": "Tamaño",
            "name": "Mediana",
            "priceDelta": "0.00"
          },
          {
            "group": "Tipo de masa",
            "name": "Clásica",
            "priceDelta": "0.00"
          }
        ]
      }
    ],
    "discounts": [],
    "totals": {
      "subtotal": "19.00",
      "discount": "0.00",
      "deliveryFee": "0.00",
      "tax": "1.73",
      "total": "19.00"
    },
    "payments": [
      {
        "method": "CASH_PICKUP",
        "status": "CASH_PENDING",
        "amount": "19.00"
      }
    ],
    "history": [
      {
        "status": "NEW",
        "at": "2026-11-12T15:48:16.797Z"
      }
    ]
  }
}
```

## Iniciar el pago con tarjeta: la app abre la URL devuelta

`postOrdersByIdPaymentSession` → `POST /api/v1/orders/689f86b2-680a-4041-803e-b385f4d70152/payment-session`

```bash
curl -X POST "$API/orders/689f86b2-680a-4041-803e-b385f4d70152/payment-session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "url": "https://checkout.stripe.test/cs_test_1"
  }
}
```

## Mi saldo de FORNO CLUB

`getLoyaltyAccount` → `GET /api/v1/loyalty/account`

```bash
curl -X GET "$API/loyalty/account" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "balance": 150,
    "lifetimeEarned": 0,
    "pointsPerEuro": "1",
    "expiryDays": null,
    "nextReward": {
      "id": "7e4a9f80-47ba-4c1f-9507-7cd3d7842826",
      "name": "Entrante a elegir",
      "pointsCost": 250,
      "pointsMissing": 100,
      "progress": 0.3333333333333333
    },
    "availableRewards": 1
  }
}
```

## Error de negocio: puntos insuficientes

`postLoyaltyRedemptions` → `POST /api/v1/loyalty/redemptions`

```bash
curl -X POST "$API/loyalty/redemptions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"rewardId":"19303f0b-80eb-4d24-9093-91113d9da40e"}' \
  -H "Accept: application/json"
```

Respuesta `409`:

```json
{
  "error": {
    "code": "INSUFFICIENT_POINTS",
    "message": "You do not have enough points",
    "requestId": "d6701b3e-71c5-4dda-a47e-fca7c6e42fcc"
  }
}
```

## Conversación con PizzAI (pública)

`postAssistantChat` → `POST /api/v1/assistant/chat`

```bash
curl -X POST "$API/assistant/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"¿Qué pizzas tenéis?"}]}' \
  -H "Accept: application/json"
```

Respuesta `200`:

```json
{
  "data": {
    "text": "Tenemos Margherita. Mira la carta.",
    "links": [
      {
        "label": "Ver la carta",
        "href": "/carta"
      }
    ]
  }
}
```
