import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JakZaczac from "@/components/JakZaczac";
import Kontakt from "@/components/Kontakt";

const JakZaczacPage = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <JakZaczac />
        <Kontakt />
      </main>
      <Footer />
    </div>
  );
};

export default JakZaczacPage;
