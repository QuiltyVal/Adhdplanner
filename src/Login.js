import { useEffect } from "react";

export default function Login() {
    useEffect(() => {
        window.TelegramLoginWidget = {
            callback: function (data) {
                console.log("Telegram Data:", data);
                localStorage.setItem("telegramUser", JSON.stringify(data));
                window.location.href = "/main"; // Перенаправляем на главную
            }
        };
    }, []);

    return (
        <div style={{ textAlign: "center", marginTop: "50px" }}>
            <h1>Войдите через Telegram</h1>
            <iframe
                src="https://oauth.telegram.org/embed/Fegefeuerbot?origin=https://dulcet-yeot-cb2d95.netlify.app&return_to=/main"
                width="250"
                height="50"
                frameBorder="0"
            ></iframe>
        </div>
    );
}
