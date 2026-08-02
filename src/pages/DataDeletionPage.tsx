import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { LEGAL_ENTITY, getFullAddress } from "@/config/legal";

// Struktura wizualna 1:1 z LegalPage (karta, SectionTitle, SubSection).
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-bold text-foreground mt-8 mb-4 border-b border-border pb-2">
    {children}
  </h2>
);

const SubSection = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-4">
    <div className="text-muted-foreground leading-relaxed">{children}</div>
  </div>
);

const DataDeletionPage = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title="Usuwanie danych — GetRido"
        description="Instrukcja usunięcia danych osobowych pozyskanych przez GetRido, w tym danych z serwisów Facebook i Instagram (Meta)."
        canonicalUrl="https://getrido.pl/usuwanie-danych"
      />
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto bg-card rounded-xl shadow-lg p-6 md:p-10">
          <div className="text-center mb-8">
            <span className="text-4xl">🗑️</span>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-2">
              {t("dataDeletion.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("dataDeletion.subtitle")}</p>
            <p className="text-center text-sm text-muted-foreground mt-4">
              {t("dataDeletion.lastUpdated")}: {LEGAL_ENTITY.lastUpdated}
            </p>
          </div>

          <SectionTitle>{t("dataDeletion.adminTitle")}</SectionTitle>
          <SubSection>
            <div className="bg-muted/50 rounded-lg p-4 my-4 text-sm">
              <p className="font-semibold text-foreground">{LEGAL_ENTITY.name}</p>
              <p>ul. {getFullAddress()}</p>
              <p>NIP: {LEGAL_ENTITY.nip} · REGON: {LEGAL_ENTITY.regon} · KRS: {LEGAL_ENTITY.krs}</p>
              <p className="mt-2">
                {t("dataDeletion.rodoContact")}:{" "}
                <a href={`mailto:${LEGAL_ENTITY.emailRodo}`} className="text-primary hover:underline">
                  {LEGAL_ENTITY.emailRodo}
                </a>
              </p>
            </div>
          </SubSection>

          <SectionTitle>{t("dataDeletion.metaDataTitle")}</SectionTitle>
          <SubSection>
            <p>{t("dataDeletion.metaDataIntro")}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>{t("dataDeletion.metaData1")}</li>
              <li>{t("dataDeletion.metaData2")}</li>
              <li>{t("dataDeletion.metaData3")}</li>
              <li>{t("dataDeletion.metaData4")}</li>
            </ul>
            <p className="mt-2">{t("dataDeletion.purposeText")}</p>
          </SubSection>

          <SectionTitle>{t("dataDeletion.howTitle")}</SectionTitle>
          <SubSection>
            <p>{t("dataDeletion.howIntro")}</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>
                {t("dataDeletion.howStep1")}{" "}
                <a href={`mailto:${LEGAL_ENTITY.emailRodo}`} className="text-primary font-semibold hover:underline">
                  {LEGAL_ENTITY.emailRodo}
                </a>
              </li>
              <li>{t("dataDeletion.howStep2")}</li>
              <li>{t("dataDeletion.howStep3")}</li>
            </ol>
            <p className="mt-2">{t("dataDeletion.deadline")}</p>
          </SubSection>

          <SectionTitle>{t("dataDeletion.scopeTitle")}</SectionTitle>
          <SubSection>
            <p>{t("dataDeletion.scopeDelete")}</p>
            <p className="mt-2">{t("dataDeletion.scopeKeep")}</p>
          </SubSection>

          <SectionTitle>{t("dataDeletion.altTitle")}</SectionTitle>
          <SubSection>
            <p>{t("dataDeletion.altText")}</p>
          </SubSection>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DataDeletionPage;
