// ============================================================================
// voiceWzorce.ts — GOTOWE ZDANIA W JĘZYKU ROZMOWY.
//
// Powód powstania (rozmowa c0yn9bxn, 15.08): detektor trzymał „ru", snapshot
// był przerobiony na rosyjski, a model i tak odpowiedział po polsku — dwa razy,
// za każdym razem zdaniem PRZEPISANYM Z PROMPTU. „Poproszę imię oraz markę
// i model auta." stoi w prompcie dokładnie w tej formie.
//
// Policzone: prompt zawiera 34 pełne zdania gotowe do wypowiedzenia. Wszystkie
// po polsku. Reguła „mów po rosyjsku" jest jedna; przykładów, jak brzmi dobra
// odpowiedź, jest 34 i każdy jest polski.
//
// ZASADA 26: model sięga po wzorzec, bo wzorzec jest konkretniejszy niż reguła.
// Przykład wygrywa z regułą NAWET WTEDY, GDY REGUŁA MÓWI COŚ PRZECIWNEGO.
//
// Dlatego blok wzorców dokleja się TYLKO dla języka innego niż polski.
// Polski prompt zostaje bit w bit taki, jaki jest — jedyna rzecz, która dziś
// działa bezbłędnie (regresja 0/20), nie dostaje ani jednego nowego znaku.
//
// ZAWIERA WYŁĄCZNIE WZORCE POZYTYWNE. Przykłady „ŹLE" z promptu polskiego
// NIE są tłumaczone: kontrast działa na regule, która stoi po polsku wyżej,
// a wzorzec negatywny w języku rozmowy to gotowe zdanie do skopiowania —
// dokładnie ten mechanizm, który tu naprawiamy.
//
// KONWENCJA LICZB per język, zgodna z modułami snapshotu:
//   ru/uk — słowami   (voiceSnapshotSlow.ts)
//   en    — cyframi   (voiceSnapshotEn.ts)
// Waluta zostaje złotówką w każdym języku.
// ============================================================================

export type JezykWzorcow = "pl" | "en" | "ru" | "uk";

type Wzorce = {
  otwarcie: string[];
  termin: string[];
  dane: string[];
  cena: string[];
  odwolanie: string[];
  domkniecie: string[];
};

const PL: Wzorce = {
  otwarcie: [
    "W czym mogę pomóc?",
  ],
  termin: [
    "Kiedy będzie najwygodniej przyjechać?",
    "Poniedziałek siedemnastego sierpnia — o dziewiątej czy o szesnastej?",
    "Czy jutro o dziewiątej będzie odpowiednie?",
    "Przepraszam, dziewiąta czy jedenasta?",
    "Nie dosłyszałam godziny — czy chodzi o dziewiątą rano?",
    "Trzeciego września wolne o dziewiątej — pasuje?",
    "Najpóźniej mogę zapisać na szesnastą — o siedemnastej zamykamy. Jeśli potrzeba później, można zostawić auto do jutra, tylko to trzeba ustalić z mechanikiem przy przyjęciu.",
  ],
  dane: [
    "Poproszę imię oraz markę i model auta.",
    "Poproszę numer rejestracyjny.",
    "Dobrze, zapisuję. Poproszę numer rejestracyjny.",
    "Dziękuję, numer zapisany.",
    "Numer mam zapisany — będzie w SMS-ie potwierdzającym, łatwiej go sprawdzić wzrokowo niż ze słuchu.",
  ],
  cena: [
    "Wymiana oleju to sto sześćdziesiąt złotych. Kiedy byłoby wygodnie przyjechać?",
    "Cenę poznamy przy przyjęciu auta — mechanik obejrzy i powie dokładnie. Kiedy byłoby wygodnie podjechać?",
    "Nie mam tej informacji — mechanik odpowie na miejscu przy przyjęciu auta.",
    "Opon niestety nie wymieniamy. Ale jeśli coś innego przy aucie — chętnie pomogę.",
  ],
  odwolanie: [
    "Dobrze, przekazuję to do warsztatu — oddzwonią, żeby potwierdzić.",
  ],
  domkniecie: [
    "Gotowe — poniedziałek siedemnasty sierpnia, dziewiąta. Potwierdzenie przyjdzie SMS-em w ciągu kilku minut.",
    "Czy mogę jeszcze w czymś pomóc?",
    "Do widzenia.",
  ],
};

const RU: Wzorce = {
  otwarcie: [
    "Да, конечно! Чем могу помочь?",
    "Чем могу помочь?",
  ],
  termin: [
    "Когда вам было бы удобно приехать?",
    "Завтра в девять — подойдёт?",
    "Четверг, шестого, в девять свободен — подойдёт?",
    "Хорошо, утро не подходит. Какое время дня было бы удобно?",
    "Извините, девять или одиннадцать?",
    "Плохо слышно — речь о девяти утра?",
    "Понедельник. Девять утра подойдёт?",
    "Третьего сентября свободно в девять — подойдёт?",
  ],
  dane: [
    "Назовите, пожалуйста, имя, а также марку и модель машины.",
    "Назовите, пожалуйста, имя.",
    "Марка и модель?",
    "Хорошо, записываю. Назовите, пожалуйста, номер машины.",
    "Назовите, пожалуйста, номер машины.",
    "Спасибо, номер записан.",
    "Номер записан — он будет в СМС с подтверждением, глазами проверить проще, чем на слух.",
  ],
  cena: [
    "Замена масла — сто шестьдесят злотых. Когда вам было бы удобно приехать?",
    "Замена колодок — ориентировочно от ста пятидесяти до двухсот пятидесяти, зависит от модели. Точную цену механик назовёт при приёмке. Когда вам было бы удобно приехать?",
    "Цену узнаем при приёмке машины — механик посмотрит и скажет точно. Когда вам было бы удобно подъехать?",
    "Не хочу говорить наугад. Механик посмотрит и оценит при приёмке. Завтра свободно в одиннадцать — подойдёт?",
    "Такой информации у меня нет — механик ответит на месте, при приёмке машины.",
    "Шины мы, к сожалению, не меняем. Но если что-то другое по машине — с радостью помогу.",
  ],
  odwolanie: [
    "Хорошо, передаю это в сервис — вам перезвонят, чтобы подтвердить.",
    "Понятно, передаю в сервис. Перезвонят и согласуют новое время.",
  ],
  domkniecie: [
    "Готово — четверг, шестого, в девять.",
    "Готово — четверг, шестого августа, одиннадцать. Подтверждение придёт по СМС в течение нескольких минут.",
    "Подтверждение отправим по СМС на этот номер.",
    "Могу ещё чем-то помочь?",
    "До свидания.",
  ],
};

const UK: Wzorce = {
  otwarcie: [
    "Так, звичайно! Чим можу допомогти?",
    "Чим можу допомогти?",
  ],
  termin: [
    "Коли вам було б зручно приїхати?",
    "Завтра о дев'ятій — підійде?",
    "Четвер, шостого, о дев'ятій вільний — підійде?",
    "Добре, ранок не підходить. Яка пора дня була б зручна?",
    "Перепрошую, о дев'ятій чи об одинадцятій?",
    "Погано чутно — йдеться про дев'яту ранку?",
    "Понеділок. Дев'ята ранку підійде?",
    "Третього вересня вільно о дев'ятій — підійде?",
  ],
  dane: [
    "Назвіть, будь ласка, ім'я, а також марку й модель авто.",
    "Назвіть, будь ласка, ім'я.",
    "Марка й модель?",
    "Добре, записую. Назвіть, будь ласка, номер авто.",
    "Назвіть, будь ласка, номер авто.",
    "Дякую, номер записано.",
    "Номер записано — він буде в СМС із підтвердженням, очима перевірити простіше, ніж на слух.",
  ],
  cena: [
    "Заміна оливи — сто шістдесят злотих. Коли вам було б зручно приїхати?",
    "Заміна колодок — орієнтовно від ста п'ятдесяти до двохсот п'ятдесяти, залежить від моделі. Точну ціну механік назве під час приймання. Коли вам було б зручно приїхати?",
    "Ціну дізнаємося під час приймання авто — механік огляне й скаже точно. Коли вам було б зручно під'їхати?",
    "Не хочу казати навмання. Механік огляне й оцінить під час приймання. Завтра вільно об одинадцятій — підійде?",
    "Такої інформації я не маю — механік відповість на місці, під час приймання авто.",
    "Шини ми, на жаль, не міняємо. Але якщо щось інше по авто — залюбки допоможу.",
  ],
  odwolanie: [
    "Добре, передаю це до сервісу — вам передзвонять, щоб підтвердити.",
    "Зрозуміло, передаю до сервісу. Передзвонять і узгодять новий час.",
  ],
  domkniecie: [
    "Готово — четвер, шостого, о дев'ятій.",
    "Готово — четвер, шостого серпня, одинадцята. Підтвердження надійде в СМС протягом кількох хвилин.",
    "Підтвердження надішлемо в СМС на цей номер.",
    "Можу ще чимось допомогти?",
    "До побачення.",
  ],
};

const EN: Wzorce = {
  otwarcie: [
    "Yes, of course! How can I help?",
    "How can I help?",
  ],
  termin: [
    "When would it suit you to come in?",
    "Would tomorrow at 9 work?",
    "Thursday the 6th at 9 is free — does that work?",
    "Understood, mornings don't work. What time of day would be better?",
    "Sorry — 9 or 11?",
    "I didn't catch the time — did you mean 9 in the morning?",
    "Monday. Does 9 in the morning work?",
    "3 September, 9 is free — does that work?",
  ],
  dane: [
    "Could I have your first name, and the make and model of the car?",
    "Your first name, please.",
    "Make and model?",
    "Alright, noted. And the registration number, please.",
    "And the registration number, please.",
    "Thank you, I have the number.",
    "I have the number — it'll be in the confirmation text, easier to check by eye than by ear.",
  ],
  cena: [
    "An oil change is 160 zloty. When would it suit you to come in?",
    "Brake pads are roughly 150 to 250 zloty, depending on the model. The mechanic will give you the exact price when you drop the car off. When would it suit you to come in?",
    "We'll know the price when you drop the car off — the mechanic will look at it and tell you exactly. When would it suit you to come in?",
    "I don't want to guess. The mechanic will look at it and price it when you drop it off. I have tomorrow at 11 free — does that work?",
    "I don't have that information — the mechanic will answer when you drop the car off.",
    "We don't do tyres, unfortunately. But if there's anything else with the car — happy to help.",
  ],
  odwolanie: [
    "Alright, I'm passing this to the workshop — they'll call you back to confirm.",
    "Understood, I'm passing it on. They'll call back and arrange a new time.",
  ],
  domkniecie: [
    "Done — Thursday the 6th at 9.",
    "Done — Thursday 6 August at 11. You'll get a confirmation text within a few minutes.",
    "We'll send the confirmation by text to this number.",
    "Is there anything else I can help with?",
    "Goodbye.",
  ],
};

const TABLICE: Record<JezykWzorcow, Wzorce> = { pl: PL, ru: RU, uk: UK, en: EN };

const NAGLOWKI: Record<JezykWzorcow, Record<keyof Wzorce, string>> = {
  pl: { otwarcie: "OTWARCIE", termin: "TERMIN", dane: "DANE KLIENTA", cena: "CENA I ODMOWA", odwolanie: "ODWOŁANIE", domkniecie: "ZAKOŃCZENIE" },
  ru: { otwarcie: "ОТКРЫТИЕ", termin: "ВРЕМЯ ВИЗИТА", dane: "ДАННЫЕ КЛИЕНТА", cena: "ЦЕНА И ОТКАЗ", odwolanie: "ОТМЕНА И ПЕРЕНОС", domkniecie: "ЗАВЕРШЕНИЕ" },
  uk: { otwarcie: "ПОЧАТОК", termin: "ЧАС ВІЗИТУ", dane: "ДАНІ КЛІЄНТА", cena: "ЦІНА ТА ВІДМОВА", odwolanie: "СКАСУВАННЯ ТА ПЕРЕНЕСЕННЯ", domkniecie: "ЗАВЕРШЕННЯ" },
  en: { otwarcie: "OPENING", termin: "APPOINTMENT TIME", dane: "CUSTOMER DETAILS", cena: "PRICE AND DECLINING", odwolanie: "CANCELLING AND RESCHEDULING", domkniecie: "CLOSING" },
};

/**
 * Blok wzorców do doklejenia do promptu.
 *
 * Zwraca `null` dla polskiego i dla nieznanego języka — brak bloku znaczy
 * „prompt bez zmian". Polski nie dostaje ani jednego znaku więcej.
 */
export function wzorceWJezyku(jezyk: JezykWzorcow | string | null | undefined): string | null {
  // POLSKI TEŻ DOSTAJE SWÓJ BLOK — i to jest zmiana wobec pierwszej wersji.
  //
  // FAZA C przeniosła polskie wzorce do STATYCZNEJ części promptu, jako czystą,
  // opisaną listę na końcu. Zrobiło się z tego coś ŁATWIEJSZEGO do skopiowania
  // niż wcześniejsze przykłady rozsiane w regułach — i angielski zaczął zwracać
  // „Poproszę imię oraz markę i model auta." oraz „Potwierdzenie przyjdzie
  // SMS-em w ciągu kilku minut." w środku angielskiego zdania. Zasada 26
  // uderzyła w nas przez wzorce, które sami uporządkowaliśmy.
  //
  // Teraz KAŻDY język dostaje wyłącznie swój blok i nigdy cudzego.
  const klucz = (jezyk || "pl") as JezykWzorcow;
  const tab = TABLICE[klucz];
  if (!tab) return null;
  const nag = NAGLOWKI[klucz];
  const sekcje = (Object.keys(tab) as (keyof Wzorce)[])
    .map((k) => `${nag[k]}:\n` + tab[k].map((z) => `  ${z}`).join("\n"))
    .join("\n");
  // Reguła po polsku, bo cały prompt jest po polsku i model czyta go jako
  // instrukcję. Wzorce są w języku rozmowy, bo to one trafiają do wypowiedzi.
  if (klucz === "pl") {
    return `\n\n=== WZORCE (mówisz tymi zdaniami; dane podmieniasz z bloku) ===\n` + sekcje + `\n`;
  }
  return `\n\n=== WZORCE W JĘZYKU ROZMOWY ===\n` +
    `Rozmowa toczy się w języku "${jezyk}". Mówisz zdaniami z listy poniżej, dopasowując tylko dane (godzinę, datę, cenę, nazwę usługi) z bloku danych.\n` +
    `Gdy potrzebujesz zdania, którego tu nie ma — układasz je sam W TYM JĘZYKU. NIGDY nie wracasz do polskiego.\n` +
    sekcje + `\n`;
}

/** Ile wzorców mamy w danym języku — do audytu i testów. */
export function liczbaWzorcow(jezyk: JezykWzorcow | string): number {
  const tab = TABLICE[jezyk as Exclude<JezykWzorcow, "pl">];
  return tab ? Object.values(tab).reduce((s, a) => s + a.length, 0) : 0;
}

/**
 * ZDANIA AWARYJNE — wypowiadane, gdy model nie odpowiedział.
 *
 * 16.08 skończyły się kredyty Anthropic i KAŻDA rozmowa, w każdym języku,
 * kończyła się polskim „Przepraszam, wystąpił chwilowy problem techniczny".
 * Rosyjski i angielski rozmówca dostawał zdanie, którego nie rozumiał —
 * w jedynym momencie, w którym musi zrozumieć.
 *
 * To NIE są wzorce do naśladowania, tylko gotowe teksty do wypowiedzenia
 * przez nasz kod, dlatego stoją osobno od `wzorceWJezyku`.
 */
type ZdaniaAwarii = { zapisane: string; limit: string; techniczne: string };

const AWARIA: Record<JezykWzorcow, ZdaniaAwarii> = {
  pl: {
    zapisane: "Rezerwacja jest zapisana. Potwierdzenie przyjdzie SMS-em w ciągu kilku minut.",
    limit: "Przepraszam, mam w tej chwili chwilowe ograniczenie techniczne. Proszę zadzwonić za kilka minut, obsługa potwierdzi szczegóły.",
    techniczne: "Przepraszam, wystąpił chwilowy problem techniczny. Obsługa oddzwoni i potwierdzi szczegóły.",
  },
  ru: {
    zapisane: "Запись сохранена. Подтверждение придёт по СМС в течение нескольких минут.",
    limit: "Извините, сейчас есть техническое ограничение. Перезвоните, пожалуйста, через несколько минут — сервис подтвердит детали.",
    techniczne: "Извините, произошёл технический сбой. Из сервиса перезвонят и подтвердят детали.",
  },
  uk: {
    zapisane: "Запис збережено. Підтвердження надійде в СМС протягом кількох хвилин.",
    limit: "Перепрошую, зараз є технічне обмеження. Зателефонуйте, будь ласка, за кілька хвилин — сервіс підтвердить деталі.",
    techniczne: "Перепрошую, стався технічний збій. Із сервісу передзвонять і підтвердять деталі.",
  },
  en: {
    zapisane: "Your booking is saved. You'll get a confirmation text within a few minutes.",
    limit: "Sorry, there's a temporary technical limit right now. Please call back in a few minutes and the workshop will confirm the details.",
    techniczne: "Sorry, there's been a technical problem. The workshop will call you back to confirm the details.",
  },
};

export function zdanieAwarii(
  rodzaj: keyof ZdaniaAwarii,
  jezyk: JezykWzorcow | string | null | undefined,
): string {
  const tab = AWARIA[(jezyk as JezykWzorcow) in AWARIA ? (jezyk as JezykWzorcow) : "pl"];
  return tab[rodzaj];
}
