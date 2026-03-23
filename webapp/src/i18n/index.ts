const messages: Record<string, Record<string, string>> = {
    en: {

        // RHS Panel
        'rhs.addTab': '+ Add Tab',
        'rhs.noTabs': 'No tabs in this channel yet.',
        'rhs.noTabsHint': 'Click "Add Tab" to create links, pages, or folders.',
        'rhs.selectChannel': 'Select a channel to manage tabs.',
        'rhs.hidden': 'hidden',
        'rhs.typePage': 'Page',
        'rhs.typeLink': 'External link',
        'rhs.opensNewTab': 'Opens in new tab',
        'rhs.dragReorder': 'Drag to reorder',
        'rhs.edit': 'Edit',
        'rhs.addToFolder': 'Add item to folder',
        'rhs.delete': 'Delete',
        'rhs.emptyFolder': 'Empty folder',
        'rhs.addItem': '+ Add',

        // Tab Modal
        'modal.editTab': 'Edit Tab',
        'modal.addNewTab': 'Add New Tab',
        'modal.type': 'Type',
        'modal.typeLink': '🔗 External Link',
        'modal.typePage': '📄 Page (Markdown)',
        'modal.typeFolder': '📁 Folder',
        'modal.title': 'Title',
        'modal.url': 'URL',
        'modal.location': 'Location',
        'modal.rootLevel': 'Root (top level)',
        'modal.cancel': 'Cancel',
        'modal.saveChanges': 'Save Changes',
        'modal.addTab': 'Add Tab',
        'modal.visible': 'Visible to all users',
        'modal.hintPage': 'A blank page will be created. You can add Markdown content after creation.',
        'modal.hintFolder': 'A folder groups related tabs together. You can drag tabs into it after creation.',
        'modal.placeholderFolder': 'e.g., Infrastructure, Resources',
        'modal.placeholderPage': 'e.g., Rules, Onboarding, FAQ',
        'modal.placeholderLink': 'e.g., Project Board, Docs',
        'modal.placeholderUrl': 'https://example.com',
        'modal.errTitleRequired': 'Title is required',
        'modal.errTitleLength': 'Title must be 100 characters or less',
        'modal.errUrlRequired': 'URL is required for link tabs',
        'modal.errUrlInvalid': 'Please enter a valid URL (e.g. https://example.com)',
        'modal.icon': 'Icon',
        'modal.iconClear': 'Remove icon',

        // Delete Confirm
        'delete.title': 'Delete Tab',
        'delete.confirm': 'Are you sure you want to delete the tab ',
        'delete.confirmEnd': '? This action cannot be undone.',
        'delete.cancel': 'Cancel',
        'delete.delete': 'Delete',

        // Page View
        'page.noContent': 'This page has no content yet.',
        'page.editPage': 'Edit Page',
        'page.failedSave': 'Failed to save',
        'page.backToTabs': 'Back to tabs',
        'page.back': '← Back',

        // Page Editor
        'editor.edit': 'Edit',
        'editor.preview': 'Preview',
        'editor.nothingToPreview': 'Nothing to preview',
        'editor.placeholder': 'Write your page content in Markdown...',
        'editor.cancel': 'Cancel',
        'editor.save': 'Save',
        'editor.saving': 'Saving...',
        'editor.contentTooLarge': 'Content too large ({size}KB / 50KB max)',
        'editor.sizeLabel': 'KB / 50KB',
        'editor.bold': 'Bold (Ctrl+B)',
        'editor.italic': 'Italic',
        'editor.heading': 'Heading',
        'editor.list': 'List',
        'editor.link': 'Link',
        'editor.code': 'Code',
        'editor.codeBlock': 'Code block',
        'editor.table': 'Table',
        'editor.upload': 'Upload file',
        'editor.uploading': 'Uploading...',
        'editor.uploadFailed': 'Upload failed: {message}',

        // Index (header button)
        'header.title': 'Channel Tabs',
        'header.tooltip': 'Manage channel tabs',
    },

    uk: {

        // RHS Panel
        'rhs.addTab': '+ Додати вкладку',
        'rhs.noTabs': 'У цьому каналі ще немає вкладок.',
        'rhs.noTabsHint': 'Натисніть "Додати вкладку", щоб створити посилання, сторінки або папки.',
        'rhs.selectChannel': 'Оберіть канал для керування вкладками.',
        'rhs.hidden': 'приховано',
        'rhs.typePage': 'Сторінка',
        'rhs.typeLink': 'Зовнішнє посилання',
        'rhs.opensNewTab': 'Відкрити в новій вкладці',
        'rhs.dragReorder': 'Перетягніть для зміни порядку',
        'rhs.edit': 'Редагувати',
        'rhs.addToFolder': 'Додати елемент до папки',
        'rhs.delete': 'Видалити',
        'rhs.emptyFolder': 'Порожня папка',
        'rhs.addItem': '+ Додати',

        // Tab Modal
        'modal.editTab': 'Редагувати вкладку',
        'modal.addNewTab': 'Нова вкладка',
        'modal.type': 'Тип',
        'modal.typeLink': '🔗 Зовнішнє посилання',
        'modal.typePage': '📄 Сторінка (Markdown)',
        'modal.typeFolder': '📁 Папка',
        'modal.title': 'Назва',
        'modal.url': 'URL',
        'modal.location': 'Розташування',
        'modal.rootLevel': 'Корінь (верхній рівень)',
        'modal.cancel': 'Скасувати',
        'modal.saveChanges': 'Зберегти зміни',
        'modal.addTab': 'Додати вкладку',
        'modal.visible': 'Видима для всіх користувачів',
        'modal.hintPage': 'Буде створена порожня сторінка. Ви зможете додати Markdown-контент після створення.',
        'modal.hintFolder': 'Папка групує повʼязані вкладки разом. Ви можете перетягнути вкладки в неї після створення.',
        'modal.placeholderFolder': 'напр., Інфраструктура, Ресурси',
        'modal.placeholderPage': 'напр., Правила, Онбординг, FAQ',
        'modal.placeholderLink': 'напр., Дошка проєкту, Документація',
        'modal.placeholderUrl': 'https://example.com',
        'modal.errTitleRequired': 'Назва обовʼязкова',
        'modal.errTitleLength': 'Назва має бути не довшою за 100 символів',
        'modal.errUrlRequired': 'URL обовʼязковий для посилань',
        'modal.errUrlInvalid': 'Введіть коректний URL (напр. https://example.com)',
        'modal.icon': 'Іконка',
        'modal.iconClear': 'Прибрати іконку',

        // Delete Confirm
        'delete.title': 'Видалити вкладку',
        'delete.confirm': 'Ви впевнені, що хочете видалити вкладку ',
        'delete.confirmEnd': '? Цю дію неможливо скасувати.',
        'delete.cancel': 'Скасувати',
        'delete.delete': 'Видалити',

        // Page View
        'page.noContent': 'Ця сторінка ще не має контенту.',
        'page.editPage': 'Редагувати сторінку',
        'page.failedSave': 'Не вдалося зберегти',
        'page.backToTabs': 'Назад до вкладок',
        'page.back': '← Назад',

        // Page Editor
        'editor.edit': 'Редагувати',
        'editor.preview': 'Перегляд',
        'editor.nothingToPreview': 'Нічого для перегляду',
        'editor.placeholder': 'Пишіть контент сторінки у форматі Markdown...',
        'editor.cancel': 'Скасувати',
        'editor.save': 'Зберегти',
        'editor.saving': 'Збереження...',
        'editor.contentTooLarge': 'Контент занадто великий ({size}КБ / 50КБ макс)',
        'editor.sizeLabel': 'КБ / 50КБ',
        'editor.bold': 'Жирний (Ctrl+B)',
        'editor.italic': 'Курсив',
        'editor.heading': 'Заголовок',
        'editor.list': 'Список',
        'editor.link': 'Посилання',
        'editor.code': 'Код',
        'editor.codeBlock': 'Блок коду',
        'editor.table': 'Таблиця',
        'editor.upload': 'Завантажити файл',
        'editor.uploading': 'Завантаження...',
        'editor.uploadFailed': 'Не вдалося завантажити файл: {message}',

        // Index (header button)
        'header.title': 'Вкладки каналу',
        'header.tooltip': 'Керувати вкладками каналу',
    },
};

export type TranslateFn = (key: string, vars?: Record<string, string>) => string;

export function getTranslations(locale: string): TranslateFn {
    const lang = locale?.startsWith('uk') ? 'uk' : 'en';
    const dict = messages[lang] || messages.en;

    return (key: string, vars?: Record<string, string>): string => {
        let text = dict[key] || messages.en[key] || key;
        if (vars) {
            for (const [k, v] of Object.entries(vars)) {
                text = text.replace(`{${k}}`, v);
            }
        }
        return text;
    };
}
