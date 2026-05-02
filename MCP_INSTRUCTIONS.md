# Подключение MCP сервера в Insomnia

Этот проект включает в себя MCP сервер, расположенный в директории `mcp-server`. Чтобы подключить его к Insomnia (версии 12+), следуйте инструкции:

1. **Запуск сервера**:
   Убедитесь, что сервер собран и зависимости установлены:
   ```bash
   cd mcp-server
   pnpm install
   pnpm run build
   ```

2. **Настройка в Insomnia**:
   - Откройте приложение Insomnia.
   - В левой боковой панели выберите раздел **MCP Clients**.
   - Нажмите **+ New MCP Client**.
   - **Name**: `Eflow Portal MCP`
   - **Type**: Выберите `Executable` (если доступно) или используйте `SSE`, если планируете запускать сервер отдельно.
   - **Command / Path**: Укажите путь к исполняемому файлу:
     `node /Users/artemgusarov/Downloads/PROJECTS/___/insomnia/mcp-server/dist/index.js`
   - **Environment Variables**: Убедитесь, что сервер видит переменные из своего файла `.env`.

3. **Использование**:
   После подключения Insomnia сможет использовать ресурсы и инструменты сервера для помощи в тестировании и автоматизации запросов к Portal-Profile API.

---
**Примечание**: Поскольку вы выбрали структуру `.insomnia/` (Git Sync), для импорта проекта в Insomnia выберите `Create` -> `Local Project` -> выберите папку `/Users/artemgusarov/Downloads/PROJECTS/___/insomnia/`.
