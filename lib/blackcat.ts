// Black Cat Pagamentos API Integration
// Docs: https://api.blackcatpagamentos.com

export interface BlackCatCustomer {
  name: string
  email: string
  phone: string
  document: {
    number: string
    type: "cpf" | "cnpj"
  }
  address: {
    street: string
    streetNumber: string
    complement?: string
    zipCode: string
    neighborhood: string
    city: string
    state: string
    country: string
  }
}

export interface BlackCatItem {
  externalRef: string
  title: string
  unitPrice: number
  quantity: number
  tangible: boolean
}

export interface BlackCatPixOptions {
  expirationDate?: string // YYYY-MM-DD
}

export interface BlackCatTransactionRequest {
  amount: number
  currency?: string
  paymentMethod: "pix" | "credit_card" | "boleto"
  installments?: number
  pix?: BlackCatPixOptions
  items: BlackCatItem[]
  customer: BlackCatCustomer
  postbackUrl: string
  returnUrl?: string
  metadata?: string
  externalRef?: string
  ip?: string
}

export interface BlackCatPixResponse {
  qrcode: string
  end2EndId: string | null
  receiptUrl: string | null
  expirationDate: string
}

export interface BlackCatTransactionResponse {
  id: number
  tenantId: string
  companyId: number
  amount: number
  currency: string
  paymentMethod: "pix" | "credit_card" | "boleto"
  status: "waiting_payment" | "pending" | "approved" | "refused" | "paid" | "refunded" | "cancelled" | "chargeback"
  installments: number
  paidAt: string | null
  paidAmount: number
  refundedAt: string | null
  refundedAmount: number
  postbackUrl: string
  metadata: string | null
  ip: string | null
  externalRef: string | null
  secureId: string
  secureUrl: string
  createdAt: string
  updatedAt: string
  pix: BlackCatPixResponse | null
  customer: {
    id: number
    name: string
    email: string
    phone: string
    document: {
      type: string
      number: string
    }
  }
  items: BlackCatItem[]
  fee: {
    netAmount: number
    estimatedFee: number
    fixedAmount: number
    spreadPercent: number
    currency: string
  }
}

export interface BlackCatWebhookPayload {
  type: "transaction" | "withdraw"
  url: string
  objectId: string
  data: BlackCatTransactionResponse
}

// Helper to create Basic Auth header
function getAuthHeader(): string {
  const publicKey = process.env.BLACKCAT_PUBLIC_KEY || ""
  const secretKey = process.env.BLACKCAT_SECRET_KEY || ""
  return "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64")
}

// Create a PIX transaction
export async function createPixTransaction(data: BlackCatTransactionRequest): Promise<BlackCatTransactionResponse> {
  const publicKey = process.env.BLACKCAT_PUBLIC_KEY
  const secretKey = process.env.BLACKCAT_SECRET_KEY

  if (!publicKey || !secretKey) {
    console.error("[BlackCat] ERRO: Chaves de API não configuradas!")
    console.error("[BlackCat] BLACKCAT_PUBLIC_KEY:", publicKey ? "Configurada" : "NÃO CONFIGURADA")
    console.error("[BlackCat] BLACKCAT_SECRET_KEY:", secretKey ? "Configurada" : "NÃO CONFIGURADA")
    throw new Error(
      "Chaves de API da Black Cat não configuradas. Configure BLACKCAT_PUBLIC_KEY e BLACKCAT_SECRET_KEY nas variáveis de ambiente.",
    )
  }

  console.log("[BlackCat] Criando transação PIX...")
  console.log("[BlackCat] URL:", "https://api.blackcatpagamentos.com/v1/transactions")
  console.log("[BlackCat] Amount:", data.amount, "centavos")
  console.log("[BlackCat] Customer:", data.customer.name, data.customer.email)

  const response = await fetch("https://api.blackcatpagamentos.com/v1/transactions", {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...data,
      paymentMethod: "pix",
    }),
  })

  console.log("[BlackCat] Response status:", response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[BlackCat] Error response:", errorText)

    let error
    try {
      error = JSON.parse(errorText)
    } catch {
      error = { message: errorText }
    }

    throw new Error(error.message || `Erro ao criar transação PIX (Status: ${response.status})`)
  }

  const result = await response.json()
  console.log("[BlackCat] Transação criada com sucesso:", {
    id: result.id,
    status: result.status,
    hasPixQrCode: !!result.pix?.qrcode,
  })

  return result
}

// Get transaction by ID
export async function getTransaction(transactionId: number): Promise<BlackCatTransactionResponse> {
  const response = await fetch(`https://api.blackcatpagamentos.com/v1/transactions/${transactionId}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Erro ao buscar transação")
  }

  return response.json()
}
