import { useTranslation } from "react-i18next";

const SEOSection = () => {
  const { t } = useTranslation();
  return (
    <section className="py-8 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t('seo.text')}
      </p>
        </div>
      </div>
    </section>
  );
};

export default SEOSection;