import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * @deprecated Thin wrapper kept for backwards compatibility — delegates to the
 * single canonical {@link LanguageSwitcher}. Prefer importing LanguageSwitcher
 * directly. Renders the outline variant used on login/portal pages and always
 * shows the full PORTAL_LANGS list (7 languages) with persistence via setLang.
 */
const LanguageSelector = () => <LanguageSwitcher variant="outline" />;

export default LanguageSelector;
