import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
    const navigate = useNavigate();

    useEffect(() => {
        // Получаем параметры из URL (они приходят от Telegram после входа)
        const params = new URLSearchParams(window.location.search);
        const userData = Object.fromEntries(params.entries()); // Преобразуем в объект

        console.log("URL parameters:", userData); // Проверяем, приходят ли данные в консоль

        if (userData.id) {
            console.log("Saving to localStorage:", userData); // Проверяем, что данные попали в проверку
            localStorage.setItem("telegramUser", JSON.stringify(userData)); // Сохраняем данные
            navigate("/main"); // Перенаправляем пользователя на главную страницу
        } else {
            console.log("No Telegram data found."); // Если данных нет, логируем это в консоль
        }
    }, []); // [] означает, что код запустится один раз при загрузке страницы

    return (
        <div style={{ textAlign: "center", marginTop: "50px" }}>
            <h1>Войдите через Telegram</h1>
            <script
                async
                src="https://telegram.org/js/telegram-widget.js?7"
                data-telegram-login="Fegefeuerbot"
                data-size="large"
                data-radius="5"
                data-auth-url="https://dulcet-yeot-cb2d95.netlify.app/"
                data-request-access="write"
            ></script>
        </div>
    );
}
