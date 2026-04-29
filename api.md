API Documentation
Base URL: https://api.bdcourier.com

API Key
nRSzgOLIkunB8jraK8aCOWdm1ZogqkiAVNaXHKNO2YzCRkkl6cIxJd49bqLT


Authorization: Bearer YOUR_API_KEY
Endpoints
Courier Check
Courier Check (Legacy)
Check Connection
My Plan
POST
Courier Check
Retrieve courier tracking information by phone number. Automatically uses free or paid plan based on your subscription.

URL
https://api.bdcourier.com/courier-check

Parameters
phone
string
Required
Phone number to check (e.g., 017xxxxxxxx)
Code Examples
cURL
PHP
Node
Python
JS
curl -X POST "https://api.bdcourier.com/courier-check" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"phone": "017xxxxxxxx"}'

Response
Success
Error
{
  "status": "success",
  "data": {
    "pathao": {
      "name": "Pathao",
      "logo": "https://api.bdcourier.com/c-logo/pathao-logo.png",
      "total_parcel": 150,
      "success_parcel": 120,
      "cancelled_parcel": 30,
      "success_ratio": 80
    },
    "steadfast": {
      "name": "SteadFast",
      "logo": "https://api.bdcourier.com/c-logo/steadfast-logo.png",
      "total_parcel": 200,
      "success_parcel": 175,
      "cancelled_parcel": 25,
      "success_ratio": 87.5
    },
    "parceldex": {
      "name": "ParcelDex",
      "logo": "https://api.bdcourier.com/c-logo/parceldex-logo.png",
      "total_parcel": 50,
      "success_parcel": 45,
      "cancelled_parcel": 5,
      "success_ratio": 90
    },
    "redx": {
      "name": "Redx",
      "logo": "https://api.bdcourier.com/c-logo/redx-logo.png",
      "total_parcel": 80,
      "success_parcel": 65,
      "cancelled_parcel": 15,
      "success_ratio": 81.25
    },
    "paperfly": {
      "name": "PaperFly",
      "logo": "https://api.bdcourier.com/c-logo/paperfly-logo.png",
      "total_parcel": 100,
      "success_parcel": 90,
      "cancelled_parcel": 10,
      "success_ratio": 90
    },
    "carrybee": {
      "name": "CarryBee",
      "logo": "https://api.bdcourier.com/c-logo/carrybee-logo.webp",
      "total_parcel": 40,
      "success_parcel": 35,
      "cancelled_parcel": 5,
      "success_ratio": 87.5
    },
    "summary": {
      "total_parcel": 620,
      "success_parcel": 530,
      "cancelled_parcel": 90,
      "success_ratio": 85.48
    }
  },
  "reports": [
    {
      "id": "abc123",
      "name": "John Doe",
      "details": "Fraud reported by merchant",
      "created_at": "2024-01-01T00:00:00.000000Z",
      "courierLogo": "https://api.bdcourier.com/c-logo/steadfast-logo.png",
      "courierName": "SteadFast"
    }
  ]
}