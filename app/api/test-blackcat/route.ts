import { NextResponse } from "next/server"

export async function GET() {
  const publicKey = process.env.BLACKCAT_PUBLIC_KEY
  const secretKey = process.env.BLACKCAT_SECRET_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const status = {
    publicKey: publicKey ? `Configurada (${publicKey.substring(0, 10)}...)` : "NÃO CONFIGURADA",
    secretKey: secretKey ? "Configurada (oculta)" : "NÃO CONFIGURADA",
    appUrl: appUrl || "NÃO CONFIGURADA",
    allConfigured: !!(publicKey && secretKey),
  }

  // Tentar fazer uma requisição de teste para a Black Cat
  if (publicKey && secretKey) {
    try {
      const authHeader = "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64")

      // Tentar listar transações para verificar se as credenciais estão corretas
      const response = await fetch("https://api.blackcatpagamentos.com/v1/transactions?limit=1", {
        method: "GET",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        return NextResponse.json({
          ...status,
          connectionTest: "SUCESSO - Credenciais válidas!",
          message: "A integração com a Black Cat está funcionando corretamente.",
        })
      } else {
        const errorText = await response.text()
        return NextResponse.json({
          ...status,
          connectionTest: `FALHOU - Status ${response.status}`,
          error: errorText,
          message: "As credenciais podem estar incorretas ou a conta não está ativa.",
        })
      }
    } catch (error) {
      return NextResponse.json({
        ...status,
        connectionTest: "ERRO DE CONEXÃO",
        error: error instanceof Error ? error.message : "Erro desconhecido",
        message: "Não foi possível conectar à API da Black Cat.",
      })
    }
  }

  return NextResponse.json({
    ...status,
    connectionTest: "NÃO TESTADO - Chaves não configuradas",
    message: "Configure BLACKCAT_PUBLIC_KEY e BLACKCAT_SECRET_KEY nas variáveis de ambiente da Netlify.",
  })
}
