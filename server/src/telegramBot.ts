export function initTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('ℹ️ Telegram Bot Token not set. System bot disabled.');
    return;
  }

  console.log('🤖 Initializing Telegram Bot...');
  let offset = 0;

  async function pollUpdates() {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`);
      if (!response.ok) {
        setTimeout(pollUpdates, 10000);
        return;
      }
      
      const body = await response.json() as any;
      if (body.ok && body.result && body.result.length > 0) {
        for (const update of body.result) {
          offset = update.update_id + 1;
          if (update.message) {
            try {
              await handleMessage(update.message);
            } catch (err) {
              console.error('❌ Error handling telegram message:', err);
            }
          }
        }
      }
      setTimeout(pollUpdates, 100);
    } catch (err) {
      console.error('❌ Telegram Bot polling error:', err);
      setTimeout(pollUpdates, 10000);
    }
  }

  pollUpdates();
}

async function handleMessage(message: any) {
  const chatId = message.chat?.id?.toString();
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `👋 *Xin chào!* Đây là bot hỗ trợ nhận thông báo nhắc nhở của ứng dụng Note.\n\n` +
          `ID Telegram của bạn là: \`${chatId}\`\n\n` +
          `Hãy sao chép ID này và dán vào phần *Cài đặt > Tích hợp Telegram* trên ứng dụng Note của bạn để liên kết nhận thông báo.`,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Failed to send telegram reply:', err);
  }
}
