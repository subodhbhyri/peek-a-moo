import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { CITIES, City } from '../../core/data/cities';

/**
 * Manual location fallback. City-level accuracy is plenty here: even 50 km of error moves the
 * Moon by far less than its own on-screen width.
 */
@Component({
  selector: 'app-city-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <p>Choose your city so the moon knows where to appear.</p>
      <input
        type="text"
        placeholder="Search cities…"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        autocomplete="off"
      />
      <ul>
        @for (city of results(); track city.name + city.country) {
          <li>
            <button type="button" (click)="pick.emit(city)">
              {{ city.name }}, {{ city.country }}
            </button>
          </li>
        } @empty {
          <li class="empty">No matches.</li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host {
      pointer-events: auto;
    }
    .panel {
      width: min(20rem, 84vw);
      max-height: 60vh;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      background: rgba(12, 11, 9, 0.9);
      border: 1px solid rgba(233, 230, 220, 0.12);
      border-radius: 0.75rem;
      padding: 1rem;
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
    button {
      font: inherit;
      font-size: 0.85rem;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      color: #e9e6dc;
      padding: 0.5em 0.2em;
      cursor: pointer;
    }
    button:hover,
    button:focus-visible {
      color: #f2efe6;
    }
    .empty {
      font-size: 0.8rem;
      opacity: 0.5;
      padding: 0.5em 0.2em;
    }
  `,
})
export class CityPicker {
  readonly pick = output<City>();
  protected readonly query = signal('');
  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = q
      ? CITIES.filter(
          (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
        )
      : CITIES;
    return list.slice(0, 30);
  });
}
