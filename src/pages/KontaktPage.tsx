import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Kontakt from "@/components/Kontakt";

const KontaktPage = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Kontakt />
      </main>
      <Footer />
    </div>
  );
};

export default KontaktPage;
