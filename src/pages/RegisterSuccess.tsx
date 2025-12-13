import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Smartphone, Home, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RegisterSuccess() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-md">
        <Card className="text-center">
          <CardHeader className="pb-2">
            <div className="flex justify-center items-center gap-4 mb-4">
              <img
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
                alt="RIDO"
                className="h-20 w-20 object-contain"
              />
              <img
                src="/lovable-uploads/getrido-mascot-email.png"
                alt="RIDO Mascot"
                className="h-20 w-20 object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {t('registerSuccess.title')}
            </h1>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Mail className="h-5 w-5" />
                <span className="font-medium">{t('registerSuccess.checkEmail')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('registerSuccess.emailSent')}
              </p>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                {t('registerSuccess.downloadHint')}
              </p>
              <Button
                onClick={() => navigate("/install")}
                size="lg"
                className="w-full gap-2"
              >
                <Smartphone className="h-5 w-5" />
                {t('registerSuccess.downloadApp')}
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="w-full gap-2"
            >
              <Home className="h-4 w-4" />
              {t('registerSuccess.backHome')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
