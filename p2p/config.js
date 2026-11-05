/* محلياً اترك API_URL. على kanba.pw ضع عنوان HTTPS العام لخادم Termux
   منتهياً /api/market. localhost يعني جهاز الزائر، لا هاتفك.
   دورية الواجهة تتبع interval من Python؛ ليس WebSocket. */
window.P2P_CONFIG = Object.freeze({
  API_URL: 'https://rural-fourth-resort-genealogy.trycloudflare.com/p2p/api/market',
  REFRESH_SECONDS: 30
});

