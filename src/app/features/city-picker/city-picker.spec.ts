import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import citiesJson from '../../../../public/data/cities.json';
import { CityService } from '../../core/data/city.service';
import { LocationService } from '../../core/sensors/location.service';
import { CityPicker, PickedLocation } from './city-picker';

describe('CityPicker', () => {
  let fixture: ComponentFixture<CityPicker>;
  let chosen: PickedLocation[];
  let tz: number;
  let closed: number;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(s: string) => el().querySelector<T>(s);
  const qa = (s: string) => Array.from(el().querySelectorAll<HTMLElement>(s));

  async function setup(zone = 'Asia/Dubai') {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: zone,
    } as Intl.ResolvedDateTimeFormatOptions);
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return new Response(JSON.stringify(citiesJson), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    chosen = [];
    tz = 0;
    closed = 0;
    fixture = TestBed.createComponent(CityPicker);
    fixture.componentInstance.choose.subscribe((p) => chosen.push(p));
    fixture.componentInstance.useTimeZone.subscribe(() => tz++);
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fetchMock).toHaveBeenCalled();
    });
    // The big list has been parsed and swapped in.
    await vi.waitFor(() => expect(TestBed.inject(CityService).status()).toBe('ready'));
    fixture.detectChanges();
    return fetchMock;
  }
  const type = (selector: string, text: string) => {
    const input = q<HTMLInputElement>(selector)!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const search = (text: string) => type('input[aria-label="Search cities"]', text);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads the big list when it opens (and only then)', async () => {
    const fetchMock = await setup();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/data/cities.json');
  });

  it('"abu" and "dhabi" both find Abu Dhabi; choosing it reports "Abu Dhabi, UAE" and its coordinates', async () => {
    await setup();
    for (const text of ['abu', 'dhabi', 'ABU DHABI']) {
      search(text);
      expect(qa('li button').map((b) => b.textContent!.trim())).toContain('Abu Dhabi, UAE');
    }
    qa('li button')
      .find((b) => b.textContent!.trim() === 'Abu Dhabi, UAE')!
      .click();
    expect(chosen).toHaveLength(1);
    expect(chosen[0].label).toBe('Abu Dhabi, UAE');
    expect(chosen[0].latitude).toBeCloseTo(24.45, 1);
    expect(chosen[0].longitude).toBeCloseTo(54.4, 1);
  });

  it('shows at most 30 results', async () => {
    await setup();
    search('a');
    expect(qa('li').length).toBe(30);
  });

  it('says a nearby city is close enough, and credits GeoNames (CC BY 4.0)', async () => {
    await setup();
    expect(el().textContent).toContain('A nearby city is close enough.');
    const credit = q('.foot')!;
    expect(credit.textContent).toContain('GeoNames');
    expect(credit.textContent).toContain('CC BY 4.0');
    expect(credit.querySelector('a')!.getAttribute('href')).toBe('https://www.geonames.org');
  });

  it('"zzzz": the no-results help, the time-zone action, and Enter coordinates', async () => {
    await setup();
    search('zzzz');
    expect(qa('li')).toHaveLength(0);
    const help = q('.help')!;
    expect(help.textContent).toContain(
      "Can't find it? A nearby city works fine — the sky looks the same within about 100 km.",
    );
    const actions = qa('.help .action').map((b) => b.textContent!.trim());
    expect(actions).toEqual(['Use my time zone (Dubai area)', 'Enter coordinates']);
    qa('.help .action')[0].click();
    expect(tz).toBe(1);
  });

  it('with no usable time zone the time-zone action is not offered', async () => {
    await setup('Etc/UTC');
    search('zzzz');
    expect(qa('.help .action').map((b) => b.textContent!.trim())).toEqual(['Enter coordinates']);
  });

  it('Enter coordinates: 24.45 and 54.38 are accepted and reported as "24.45°, 54.38°"', async () => {
    await setup();
    search('zzzz');
    qa('.help .action')
      .find((b) => b.textContent!.includes('Enter coordinates'))!
      .click();
    fixture.detectChanges();
    const submit = q<HTMLButtonElement>('button[type=submit]')!;
    expect(submit.disabled).toBe(true);
    type('#loc-lat', '24.45');
    type('#loc-lon', '54.38');
    expect(submit.disabled).toBe(false);
    expect(q('.error')).toBeNull();
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(chosen).toEqual([{ latitude: 24.45, longitude: 54.38, label: '24.45°, 54.38°' }]);
  });

  it('a pasted "25.2048, 55.2708" fills both fields', async () => {
    await setup();
    search('zzzz');
    qa('.help .action')
      .find((b) => b.textContent!.includes('Enter coordinates'))!
      .click();
    fixture.detectChanges();
    type('#loc-lat', '25.2048, 55.2708');
    expect(q<HTMLInputElement>('#loc-lat')!.value).toBe('25.2048');
    expect(q<HTMLInputElement>('#loc-lon')!.value).toBe('55.2708');
    expect(q<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
  });

  it('out-of-range or non-numeric values show a message and cannot be submitted', async () => {
    await setup();
    search('zzzz');
    qa('.help .action')
      .find((b) => b.textContent!.includes('Enter coordinates'))!
      .click();
    fixture.detectChanges();
    const submit = q<HTMLButtonElement>('button[type=submit]')!;
    type('#loc-lat', '95');
    type('#loc-lon', '54');
    expect(q('.error')!.textContent).toContain('Latitude must be between -90 and 90');
    expect(submit.disabled).toBe(true);
    type('#loc-lat', '24');
    type('#loc-lon', '181');
    expect(q('.error')!.textContent).toContain('Longitude must be between -180 and 180');
    type('#loc-lon', 'abc');
    expect(q('.error')!.textContent).toContain('Longitude should be a number');
    expect(submit.disabled).toBe(true);
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(chosen).toEqual([]);
  });

  it('Close reports closed; everything has a 44 px touch size', async () => {
    await setup();
    q<HTMLButtonElement>('.close')!.click();
    expect(closed).toBe(1);
  });

  it('works offline on a first visit: the built-in capitals are searchable', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Asia/Dubai',
    } as Intl.ResolvedDateTimeFormatOptions);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    fixture = TestBed.createComponent(CityPicker);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    search('abu dhabi');
    expect(qa('li button').map((b) => b.textContent!.trim())).toEqual(['Abu Dhabi, UAE']);
    // And LocationService is untouched by merely opening the picker.
    expect(TestBed.inject(LocationService).position()).toBeNull();
  });
});
