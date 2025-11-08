// --- IMPORTANTE: Este é um arquivo de EXEMPLO de backend ---
// --- Você NÃO pode rodar isso diretamente no navegador ---
// --- Este código deve ser rodado em um servidor (Node.js) ---

// 1. Importar as bibliotecas
// (Você precisaria instalar via 'npm install stripe express cors')
const stripe = require('stripe')(// O CÓDIGO (CORRETO)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // ⚠️ MODIFICADO: Usa a variável de ambiente segura
const express = require('express');
const cors = require('cors'); // NOVO: Adicionado para permitir chamadas do seu frontend
const app = express();

// 2. Configurar o Express
app.use(cors()); // NOVO: Permite que seu site (frontend) chame este backend
app.use(express.json()); // Para ler JSONs vindos do frontend

// ⚠️ MODIFICADO: Você pode remover isso ou deixar para testar, 
//    mas o Vercel vai usar a URL dele
const DOMINIO_DO_SEU_SITE = 'http://localhost:4242'; // Mude para seu site real

// 3. Criar a rota/endpoint que o frontend vai chamar
app.post('/create-checkout-session', async (req, res) => {
  try {
    // Pega o ID do preço que o usuário clicou (enviado pelo frontend)
    const { priceId } = req.body;

    // 4. Criar a Sessão de Checkout no Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Aceitar apenas cartão
      
      // Os itens que o usuário está comprando (no caso, a assinatura)
      line_items: [
        {
          price: priceId, // O ID do Preço do seu Plano (Mensal ou Anual)
          quantity: 1,
        },
      ],
      mode: 'subscription', // MUITO IMPORTANTE: Define que é uma assinatura
      
      // URLs para onde o Stripe vai redirecionar o usuário
      // ⚠️ IMPORTANTE: Atualize estas URLs para as do seu site real
      success_url: `${DOMINIO_DO_SEU_SITE}/sucesso.html`, // Página de "Obrigado"
      cancel_url: `${DOMINIO_DO_SEU_SITE}/cancelado.html`, // Página de "Ops, algo deu errado"
    });

    // 5. Enviar o ID da sessão de volta para o frontend
    res.json({ id: session.id });

  } catch (error) {
    console.error("Erro ao criar sessão do Stripe:", error);
    res.status(500).send({ error: error.message });
  }
});

// 6. Iniciar o servidor
// app.listen(4242, () => console.log('Servidor rodando na porta 4242'));
// ⚠️ MODIFICADO: Removemos o app.listen. O Vercel cuida disso.

// 7. NOVO: Exportamos o 'app' para o Vercel usar
module.exports = app;