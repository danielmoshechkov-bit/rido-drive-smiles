# Mostek fiskalny jako usługa systemowa

Mostek uruchamiany ręcznie (`npm run fiscal:bridge`) znika po restarcie komputera — a wtedy
warsztat rano nie wydrukuje paragonu i nie wie dlaczego. Poniższe skrypty ustawiają go tak,
żeby wstawał razem z systemem i sam podnosił się po awarii.

Instalujesz **na komputerze stojącym przy drukarce** — tym samym, na którym otwierasz GetRido.

| System | Instalacja | Odinstalowanie |
|---|---|---|
| macOS | `npm run fiscal:service:install` | `bash scripts/elzab/service/install-macos.sh --uninstall` |
| Linux | `bash scripts/elzab/service/install-linux.sh` | `bash scripts/elzab/service/install-linux.sh --uninstall` |
| Windows | `scripts\elzab\service\install-windows.cmd` | `scripts\elzab\service\install-windows.cmd /uninstall` |

Po instalacji sprawdź:

```
curl http://127.0.0.1:9110/health
```

Powinno wrócić `{"ok":true,...}`. To samo sprawdza przycisk **Sprawdź mostek** w panelu
(Warsztat & Auto → Ustawienia → Fiskalizacja).

## Token (zalecane na komputerze współdzielonym)

Mostek nasłuchuje wyłącznie na `127.0.0.1`, więc z sieci nikt się do niego nie dobije, a CORS
przepuszcza tylko adresy GetRido. Jeśli mimo to chcesz dodatkowej blokady, ustaw token przed
instalacją — trafi do konfiguracji usługi:

```bash
FISCAL_BRIDGE_TOKEN=tajne-haslo npm run fiscal:service:install
```

Ten sam token wpisz w panelu w polu **Token** przy mostku.

## Aktualizacja mostka

Usługa uruchamia pliki z tego repozytorium, więc po `git pull` wystarczy ją zrestartować:

- macOS: `launchctl kickstart -k gui/$(id -u)/com.getrido.fiscal-bridge`
- Linux: `systemctl --user restart getrido-fiscal-bridge`
- Windows: `schtasks /End /TN "GetRido Mostek fiskalny" && schtasks /Run /TN "GetRido Mostek fiskalny"`

**Restart jest obowiązkowy po każdej zmianie w `supabase/functions/_shared/elzab/`** — Node
trzyma moduły w pamięci i bez restartu drukowałby starym kodem.

## Logi

- macOS: `~/Library/Logs/GetRido/fiscal-bridge.log`
- Linux: `journalctl --user -u getrido-fiscal-bridge -f`
- Windows: okno zadania (albo przekieruj wyjście w poleceniu zadania)
