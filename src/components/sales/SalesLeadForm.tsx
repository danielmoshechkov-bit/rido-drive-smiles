import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateSalesLead, useSalesCategories } from "@/hooks/useSalesLeads";
import { Loader2, Building, Phone, Mail, MapPin, Globe, FileText } from "lucide-react";

const leadSchema = z.object({
  category_id: z.string().min(1, "Wybierz kategorię"),
  company_name: z.string().min(2, "Nazwa firmy jest wymagana"),
  phone: z.string().min(9, "Podaj poprawny numer telefonu"),
  email: z.string().email("Podaj poprawny email").optional().or(z.literal("")),
  city: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  nip: z.string().optional(),
  notes: z.string().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;

interface SalesLeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: string;
}

export function SalesLeadForm({ open, onOpenChange, defaultCategory }: SalesLeadFormProps) {
  const { data: categories } = useSalesCategories();
  const createLead = useCreateSalesLead();
  
  const defaultCategoryId = categories?.find(c => c.slug === defaultCategory)?.id || "";
  
  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      category_id: defaultCategoryId,
      company_name: "",
      phone: "",
      email: "",
      city: "",
      address: "",
      website: "",
      nip: "",
      notes: "",
    },
  });

  const onSubmit = async (data: LeadFormData) => {
    try {
      await createLead.mutateAsync({
        category_id: data.category_id,
        company_name: data.company_name,
        phone: data.phone,
        email: data.email || null,
        city: data.city || null,
        address: data.address || null,
        website: data.website || null,
        nip: data.nip || null,
        notes: data.notes || null,
        source: "manual",
        status: "new",
        registered_user_id: null,
        registered_at: null,
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj nowego leada</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kategoria *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz kategorię" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nazwa firmy *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} className="pl-9" placeholder="Nazwa firmy" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input {...field} className="pl-9" placeholder="123456789" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input {...field} className="pl-9" placeholder="email@firma.pl" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Miasto</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input {...field} className="pl-9" placeholder="Miasto" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIP</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input {...field} className="pl-9" placeholder="1234567890" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strona www</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} className="pl-9" placeholder="www.firma.pl" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notatki</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Dodatkowe informacje..." rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={createLead.isPending}>
                {createLead.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Dodaj lead
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
