import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInventoryFeatures } from '@/hooks/useInventoryFeatures';
import { InventoryProductList } from './InventoryProductList';
import { InventoryStockView } from './InventoryStockView';
import { InventoryPurchaseOCR } from './InventoryPurchaseOCR';
import { InventoryStocktaking } from './InventoryStocktaking';
import { 
  Package, 
  FileText, 
  ArrowUpDown, 
  ClipboardList,
  Link2,
  Loader2
} from 'lucide-react';

type InventoryTab = 'products' | 'stock' | 'purchases' | 'aliases' | 'stocktaking';

interface Props {
  entityId?: string;
}

export function InventoryModuleView({ entityId }: Props) {
  const { features, loading } = useInventoryFeatures();
  const [activeTab, setActiveTab] = useState<InventoryTab>('products');

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!features.inventory_enabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="font-semibold mb-2">Moduł Magazyn jest wyłączony</p>
          <p className="text-sm text-muted-foreground">
            Skontaktuj się z administratorem, aby włączyć tę funkcję.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tabs = [
    { id: 'products' as const, label: 'Towary', icon: Package, visible: true },
    { id: 'stock' as const, label: 'Stany', icon: ArrowUpDown, visible: true },
    { id: 'purchases' as const, label: 'Zakupy (OCR)', icon: FileText, visible: features.inventory_purchase_ocr_enabled },
    { id: 'aliases' as const, label: 'Powiązania', icon: Link2, visible: features.inventory_alias_mapping_enabled },
    { id: 'stocktaking' as const, label: 'Inwentaryzacja', icon: ClipboardList, visible: features.inventory_stocktaking_enabled },
  ].filter(t => t.visible);

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="rounded-full"
          >
            <tab.icon className="h-4 w-4 mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'products' && (
        <InventoryProductList entityId={entityId} showBarcode={features.inventory_barcode_enabled} />
      )}

      {activeTab === 'stock' && (
        <InventoryStockView entityId={entityId} />
      )}

      {activeTab === 'purchases' && features.inventory_purchase_ocr_enabled && (
        <InventoryPurchaseOCR entityId={entityId} />
      )}

      {activeTab === 'aliases' && features.inventory_alias_mapping_enabled && (
        <Card>
          <CardContent className="py-12 text-center">
            <Link2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-semibold mb-2">Powiązania produktów</p>
            <p className="text-sm text-muted-foreground">
              Zarządzaj powiązaniami nazw z faktur do produktów w magazynie.
              <br />Ta sekcja jest dostępna z poziomu zakładki "Zakupy (OCR)".
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'stocktaking' && features.inventory_stocktaking_enabled && (
        <InventoryStocktaking entityId={entityId} />
      )}
    </div>
  );
}
