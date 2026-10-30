import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { City, cityLabel, searchCities } from '../../core/data/cities';
import { CityService } from '../../core/data/city.service';
import {
  Coordinates,
  formatCoordinates,
  parseCoordinateFields,
  parseCoordinatePair,
  validCoordinates,
} from '../../core/data/coordinates';
import { LocationService } from '../../core/sensors/location.service';

/** What the picker hands back: a place and the name to show for it. */
export interface PickedLocation {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Manual location. Never a dead end: search a big city list (loaded when this opens), or, when nothing
 * matches, use the device's time-zone area or type coordinates. A nearby place is close enough: the sky
 * looks the same within about 100 km.
 */
@Component({
  selector: 'app-city-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel" role="dialog" aria-label="Choose your location">
      <p>Choose your city so the sky knows where to look. A nearby city is close enough.</p>
      <input
        type="text"
        placeholder="Search cities…"
        aria-label="Search cities"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        autocomplete="off"
      />
      @if (results().length > 0) {
        <ul>
          @for (city of results(); track $index) {
            <li>
              <button type="button" (click)="pickCity(city)">{{ label(city) }}</button>
            </li>
          }
        </ul>
      } @else {
        <div class="help" role="status">
          <p>
            Can't find it? A nearby city works fine — the sky looks the same within about 100 km.
          </p>
          @if (area(); as a) {
            <button type="button" class="action" (click)="useTimeZone.emit()">
              Use my time zone ({{ a.label }} area)
            </button>
          }
          @if (!entering()) {
            <button type="button" class="action" (click)="entering.set(true)">
              Enter coordinates
            </button>
          } @else {
            <form class="coords" (submit)="submitCoords($event)">
              <label for="loc-lat">Latitude</label>
              <input
                id="loc-lat"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="24.45"
                [value]="lat()"
                (input)="onLat($any($event.target).value)"
              />
              <label for="loc-lon">Longitude</label>
              <input
                id="loc-lon"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="54.38"
                [value]="lon()"
                (input)="lon.set($any($event.target).value)"
              />
              @if (coordsError(); as err) {
                <p class="error" role="alert">{{ err }}</p>
              }
              <button type="submit" class="action primary" [disabled]="!coords()">Use these</button>
            </form>
          }
        </div>
      }
      <div class="foot">
        <small
          >City data:
          <a href="https://www.geonames.org" target="_blank" rel="noopener">GeoNames</a> (CC BY
          4.0)</small
        >
        <button type="button" class="close" (click)="closed.emit()">Close</button>
      </div>
    </div>
  `,
  styles: `
    :host {
      pointer-events: auto;
    }
    .panel {
      width: min(20rem, 84vw);
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      background: rgba(12, 11, 9, 0.92);
      border: 1px solid rgba(233, 230, 220, 0.12);
      border-radius: 0.75rem;
      padding: 1rem;
      color: #e9e6dc;
      font-family: system-ui, sans-serif;
    }
    p {
      margin: 0;
      font-size: 0.85rem;
      opacity: 0.75;
    }
    input {
      font: inherit;
      font-size: 0.9rem;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 0.5rem;
      color: #e9e6dc;
      padding: 0.5em 0.7em;
      min-height: 44px;
      box-sizing: border-box;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow-y: auto;
    }
    li + li {
      border-top: 1px solid rgba(233, 230, 220, 0.08);
    }
    li button {
      font: inherit;
      font-size: 0.85rem;
      width: 100%;
      min-height: 44px;
      text-align: left;
      background: none;
      border: none;
      color: #e9e6dc;
      padding: 0.5em 0.2em;
      cursor: pointer;
    }
    li button:hover,
    li button:focus-visible {
      color: #f2efe6;
    }
    .help {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .help p {
      opacity: 0.85;
    }
    .action {
      font: inherit;
      font-size: 0.85rem;
      min-height: 44px;
      color: #e9e6dc;
      background: rgba(233, 230, 220, 0.1);
      border: 1px solid rgba(233, 230, 220, 0.25);
      border-radius: 999px;
      padding: 0 1rem;
      cursor: pointer;
    }
    .action.primary {
      background: #e9e6dc;
      color: #14120e;
    }
    .action:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .coords {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .coords label {
      font-size: 0.75rem;
      opacity: 0.85;
    }
    .error {
      color: #f0b4a0;
      opacity: 1;
    }
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.7rem;
      opacity: 0.7;
    }
    .foot a {
      color: inherit;
    }
    .close {
      font: inherit;
      font-size: 0.8rem;
      min-height: 44px;
      padding: 0 0.8rem;
      color: inherit;
      background: none;
      border: none;
      cursor: pointer;
    }
  `,
})
export class CityPicker {
  private readonly cities = inject(CityService);
  private readonly location = inject(LocationService);

  /** A place was chosen (a city, or coordinates). */
  readonly choose = output<PickedLocation>();
  /** "Use my time zone". */
  readonly useTimeZone = output<void>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly entering = signal(false);
  protected readonly lat = signal('');
  protected readonly lon = signal('');
  protected readonly area = computed(() => this.location.timeZoneArea());

  protected readonly results = computed(() => searchCities(this.cities.index(), this.query(), 30));

  protected readonly coords = computed<Coordinates | null>(() =>
    parseCoordinateFields(this.lat(), this.lon()),
  );
  /** Only once both fields have something in them, so an empty form is not an error. */
  protected readonly coordsError = computed(() => {
    const la = this.lat().trim();
    const lo = this.lon().trim();
    if (!la && !lo) return null;
    const n = (s: string) => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN);
    if (la && Number.isNaN(n(la))) return 'Latitude should be a number like 24.45.';
    if (lo && Number.isNaN(n(lo))) return 'Longitude should be a number like 54.38.';
    if (la && Math.abs(n(la)) > 90) return 'Latitude must be between -90 and 90.';
    if (lo && Math.abs(n(lo)) > 180) return 'Longitude must be between -180 and 180.';
    return null;
  });

  constructor() {
    // The big list is fetched now, not at app start.
    void this.cities.load();
  }

  protected label(c: City): string {
    return cityLabel(c);
  }

  protected pickCity(c: City): void {
    this.choose.emit({ latitude: c.latitude, longitude: c.longitude, label: cityLabel(c) });
  }

  /** Typing a latitude normally; pasting "25.2048, 55.2708" fills both fields. */
  protected onLat(value: string): void {
    const pair = parseCoordinatePair(value);
    if (pair && /[,;\s]/.test(value.trim())) {
      this.lat.set(String(pair.latitude));
      this.lon.set(String(pair.longitude));
      return;
    }
    this.lat.set(value);
  }

  protected submitCoords(event: Event): void {
    event.preventDefault();
    const c = this.coords();
    if (!c || !validCoordinates(c.latitude, c.longitude)) return;
    this.choose.emit({ ...c, label: formatCoordinates(c) });
  }
}
