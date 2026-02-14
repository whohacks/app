export const sendTelegramMessage = async (token: string, chatId: string, message: string): Promise<void> => {
  if (!token || !chatId) {
    throw new Error('Telegram token/chat ID missing');
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    })
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
};

export const testTelegramConnection = async (token: string, chatId: string): Promise<void> => {
  await sendTelegramMessage(token, chatId, 'Trading Journal test message: Telegram integration is working.');
};
