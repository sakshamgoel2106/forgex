export interface CountryData {
  name: string;
  code: string;
  primaryTimezone: string;
  timezones: string[];
}

export const COUNTRIES: CountryData[] = [
  { name: 'Afghanistan', code: 'AF', primaryTimezone: 'Asia/Kabul', timezones: ['Asia/Kabul'] },
  { name: 'Albania', code: 'AL', primaryTimezone: 'Europe/Tirane', timezones: ['Europe/Tirane'] },
  { name: 'Algeria', code: 'DZ', primaryTimezone: 'Africa/Algiers', timezones: ['Africa/Algiers'] },
  { name: 'Andorra', code: 'AD', primaryTimezone: 'Europe/Andorra', timezones: ['Europe/Andorra'] },
  { name: 'Angola', code: 'AO', primaryTimezone: 'Africa/Luanda', timezones: ['Africa/Luanda'] },
  { name: 'Antigua and Barbuda', code: 'AG', primaryTimezone: 'America/Antigua', timezones: ['America/Antigua'] },
  { name: 'Argentina', code: 'AR', primaryTimezone: 'America/Argentina/Buenos_Aires', timezones: ['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba', 'America/Argentina/Mendoza'] },
  { name: 'Armenia', code: 'AM', primaryTimezone: 'Asia/Yerevan', timezones: ['Asia/Yerevan'] },
  { name: 'Australia', code: 'AU', primaryTimezone: 'Australia/Sydney', timezones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart'] },
  { name: 'Austria', code: 'AT', primaryTimezone: 'Europe/Vienna', timezones: ['Europe/Vienna'] },
  { name: 'Azerbaijan', code: 'AZ', primaryTimezone: 'Asia/Baku', timezones: ['Asia/Baku'] },
  { name: 'Bahamas', code: 'BS', primaryTimezone: 'America/Nassau', timezones: ['America/Nassau'] },
  { name: 'Bahrain', code: 'BH', primaryTimezone: 'Asia/Bahrain', timezones: ['Asia/Bahrain'] },
  { name: 'Bangladesh', code: 'BD', primaryTimezone: 'Asia/Dhaka', timezones: ['Asia/Dhaka'] },
  { name: 'Barbados', code: 'BB', primaryTimezone: 'America/Barbados', timezones: ['America/Barbados'] },
  { name: 'Belarus', code: 'BY', primaryTimezone: 'Europe/Minsk', timezones: ['Europe/Minsk'] },
  { name: 'Belgium', code: 'BE', primaryTimezone: 'Europe/Brussels', timezones: ['Europe/Brussels'] },
  { name: 'Belize', code: 'BZ', primaryTimezone: 'America/Belize', timezones: ['America/Belize'] },
  { name: 'Benin', code: 'BJ', primaryTimezone: 'Africa/Porto-Novo', timezones: ['Africa/Porto-Novo'] },
  { name: 'Bhutan', code: 'BT', primaryTimezone: 'Asia/Thimphu', timezones: ['Asia/Thimphu'] },
  { name: 'Bolivia', code: 'BO', primaryTimezone: 'America/La_Paz', timezones: ['America/La_Paz'] },
  { name: 'Bosnia and Herzegovina', code: 'BA', primaryTimezone: 'Europe/Sarajevo', timezones: ['Europe/Sarajevo'] },
  { name: 'Botswana', code: 'BW', primaryTimezone: 'Africa/Gaborone', timezones: ['Africa/Gaborone'] },
  { name: 'Brazil', code: 'BR', primaryTimezone: 'America/Sao_Paulo', timezones: ['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Cuiaba'] },
  { name: 'Brunei', code: 'BN', primaryTimezone: 'Asia/Brunei', timezones: ['Asia/Brunei'] },
  { name: 'Bulgaria', code: 'BG', primaryTimezone: 'Europe/Sofia', timezones: ['Europe/Sofia'] },
  { name: 'Burkina Faso', code: 'BF', primaryTimezone: 'Africa/Ouagadougou', timezones: ['Africa/Ouagadougou'] },
  { name: 'Burundi', code: 'BI', primaryTimezone: 'Africa/Bujumbura', timezones: ['Africa/Bujumbura'] },
  { name: 'Cambodia', code: 'KH', primaryTimezone: 'Asia/Phnom_Penh', timezones: ['Asia/Phnom_Penh'] },
  { name: 'Cameroon', code: 'CM', primaryTimezone: 'Africa/Douala', timezones: ['Africa/Douala'] },
  { name: 'Canada', code: 'CA', primaryTimezone: 'America/Toronto', timezones: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Calgary', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns'] },
  { name: 'Cape Verde', code: 'CV', primaryTimezone: 'Atlantic/Cape_Verde', timezones: ['Atlantic/Cape_Verde'] },
  { name: 'Central African Republic', code: 'CF', primaryTimezone: 'Africa/Bangui', timezones: ['Africa/Bangui'] },
  { name: 'Chad', code: 'TD', primaryTimezone: 'Africa/Ndjamena', timezones: ['Africa/Ndjamena'] },
  { name: 'Chile', code: 'CL', primaryTimezone: 'America/Santiago', timezones: ['America/Santiago', 'Pacific/Easter'] },
  { name: 'China', code: 'CN', primaryTimezone: 'Asia/Shanghai', timezones: ['Asia/Shanghai', 'Asia/Urumqi'] },
  { name: 'Colombia', code: 'CO', primaryTimezone: 'America/Bogota', timezones: ['America/Bogota'] },
  { name: 'Comoros', code: 'KM', primaryTimezone: 'Indian/Comoro', timezones: ['Indian/Comoro'] },
  { name: 'Congo (DRC)', code: 'CD', primaryTimezone: 'Africa/Kinshasa', timezones: ['Africa/Kinshasa', 'Africa/Lubumbashi'] },
  { name: 'Congo (Republic)', code: 'CG', primaryTimezone: 'Africa/Brazzaville', timezones: ['Africa/Brazzaville'] },
  { name: 'Costa Rica', code: 'CR', primaryTimezone: 'America/Costa_Rica', timezones: ['America/Costa_Rica'] },
  { name: 'Croatia', code: 'HR', primaryTimezone: 'Europe/Zagreb', timezones: ['Europe/Zagreb'] },
  { name: 'Cuba', code: 'CU', primaryTimezone: 'America/Havana', timezones: ['America/Havana'] },
  { name: 'Cyprus', code: 'CY', primaryTimezone: 'Asia/Nicosia', timezones: ['Asia/Nicosia'] },
  { name: 'Czech Republic', code: 'CZ', primaryTimezone: 'Europe/Prague', timezones: ['Europe/Prague'] },
  { name: 'Denmark', code: 'DK', primaryTimezone: 'Europe/Copenhagen', timezones: ['Europe/Copenhagen'] },
  { name: 'Djibouti', code: 'DJ', primaryTimezone: 'Africa/Djibouti', timezones: ['Africa/Djibouti'] },
  { name: 'Dominican Republic', code: 'DO', primaryTimezone: 'America/Santo_Domingo', timezones: ['America/Santo_Domingo'] },
  { name: 'Ecuador', code: 'EC', primaryTimezone: 'America/Guayaquil', timezones: ['America/Guayaquil', 'Pacific/Galapagos'] },
  { name: 'Egypt', code: 'EG', primaryTimezone: 'Africa/Cairo', timezones: ['Africa/Cairo'] },
  { name: 'El Salvador', code: 'SV', primaryTimezone: 'America/El_Salvador', timezones: ['America/El_Salvador'] },
  { name: 'Equatorial Guinea', code: 'GQ', primaryTimezone: 'Africa/Malabo', timezones: ['Africa/Malabo'] },
  { name: 'Eritrea', code: 'ER', primaryTimezone: 'Africa/Asmara', timezones: ['Africa/Asmara'] },
  { name: 'Estonia', code: 'EE', primaryTimezone: 'Europe/Tallinn', timezones: ['Europe/Tallinn'] },
  { name: 'Eswatini', code: 'SZ', primaryTimezone: 'Africa/Mbabane', timezones: ['Africa/Mbabane'] },
  { name: 'Ethiopia', code: 'ET', primaryTimezone: 'Africa/Addis_Ababa', timezones: ['Africa/Addis_Ababa'] },
  { name: 'Fiji', code: 'FJ', primaryTimezone: 'Pacific/Fiji', timezones: ['Pacific/Fiji'] },
  { name: 'Finland', code: 'FI', primaryTimezone: 'Europe/Helsinki', timezones: ['Europe/Helsinki'] },
  { name: 'France', code: 'FR', primaryTimezone: 'Europe/Paris', timezones: ['Europe/Paris'] },
  { name: 'Gabon', code: 'GA', primaryTimezone: 'Africa/Libreville', timezones: ['Africa/Libreville'] },
  { name: 'Gambia', code: 'GM', primaryTimezone: 'Africa/Banjul', timezones: ['Africa/Banjul'] },
  { name: 'Georgia', code: 'GE', primaryTimezone: 'Asia/Tbilisi', timezones: ['Asia/Tbilisi'] },
  { name: 'Germany', code: 'DE', primaryTimezone: 'Europe/Berlin', timezones: ['Europe/Berlin'] },
  { name: 'Ghana', code: 'GH', primaryTimezone: 'Africa/Accra', timezones: ['Africa/Accra'] },
  { name: 'Greece', code: 'GR', primaryTimezone: 'Europe/Athens', timezones: ['Europe/Athens'] },
  { name: 'Guatemala', code: 'GT', primaryTimezone: 'America/Guatemala', timezones: ['America/Guatemala'] },
  { name: 'Guinea', code: 'GN', primaryTimezone: 'Africa/Conakry', timezones: ['Africa/Conakry'] },
  { name: 'Guyana', code: 'GY', primaryTimezone: 'America/Guyana', timezones: ['America/Guyana'] },
  { name: 'Haiti', code: 'HT', primaryTimezone: 'America/Port-au-Prince', timezones: ['America/Port-au-Prince'] },
  { name: 'Honduras', code: 'HN', primaryTimezone: 'America/Tegucigalpa', timezones: ['America/Tegucigalpa'] },
  { name: 'Hungary', code: 'HU', primaryTimezone: 'Europe/Budapest', timezones: ['Europe/Budapest'] },
  { name: 'Iceland', code: 'IS', primaryTimezone: 'Atlantic/Reykjavik', timezones: ['Atlantic/Reykjavik'] },
  { name: 'India', code: 'IN', primaryTimezone: 'Asia/Kolkata', timezones: ['Asia/Kolkata'] },
  { name: 'Indonesia', code: 'ID', primaryTimezone: 'Asia/Jakarta', timezones: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] },
  { name: 'Iran', code: 'IR', primaryTimezone: 'Asia/Tehran', timezones: ['Asia/Tehran'] },
  { name: 'Iraq', code: 'IQ', primaryTimezone: 'Asia/Baghdad', timezones: ['Asia/Baghdad'] },
  { name: 'Ireland', code: 'IE', primaryTimezone: 'Europe/Dublin', timezones: ['Europe/Dublin'] },
  { name: 'Israel', code: 'IL', primaryTimezone: 'Asia/Jerusalem', timezones: ['Asia/Jerusalem'] },
  { name: 'Italy', code: 'IT', primaryTimezone: 'Europe/Rome', timezones: ['Europe/Rome'] },
  { name: 'Ivory Coast', code: 'CI', primaryTimezone: 'Africa/Abidjan', timezones: ['Africa/Abidjan'] },
  { name: 'Jamaica', code: 'JM', primaryTimezone: 'America/Jamaica', timezones: ['America/Jamaica'] },
  { name: 'Japan', code: 'JP', primaryTimezone: 'Asia/Tokyo', timezones: ['Asia/Tokyo'] },
  { name: 'Jordan', code: 'JO', primaryTimezone: 'Asia/Amman', timezones: ['Asia/Amman'] },
  { name: 'Kazakhstan', code: 'KZ', primaryTimezone: 'Asia/Almaty', timezones: ['Asia/Almaty', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Oral'] },
  { name: 'Kenya', code: 'KE', primaryTimezone: 'Africa/Nairobi', timezones: ['Africa/Nairobi'] },
  { name: 'Kuwait', code: 'KW', primaryTimezone: 'Asia/Kuwait', timezones: ['Asia/Kuwait'] },
  { name: 'Kyrgyzstan', code: 'KG', primaryTimezone: 'Asia/Bishkek', timezones: ['Asia/Bishkek'] },
  { name: 'Laos', code: 'LA', primaryTimezone: 'Asia/Vientiane', timezones: ['Asia/Vientiane'] },
  { name: 'Latvia', code: 'LV', primaryTimezone: 'Europe/Riga', timezones: ['Europe/Riga'] },
  { name: 'Lebanon', code: 'LB', primaryTimezone: 'Asia/Beirut', timezones: ['Asia/Beirut'] },
  { name: 'Liberia', code: 'LR', primaryTimezone: 'Africa/Monrovia', timezones: ['Africa/Monrovia'] },
  { name: 'Libya', code: 'LY', primaryTimezone: 'Africa/Tripoli', timezones: ['Africa/Tripoli'] },
  { name: 'Lithuania', code: 'LT', primaryTimezone: 'Europe/Vilnius', timezones: ['Europe/Vilnius'] },
  { name: 'Luxembourg', code: 'LU', primaryTimezone: 'Europe/Luxembourg', timezones: ['Europe/Luxembourg'] },
  { name: 'Madagascar', code: 'MG', primaryTimezone: 'Indian/Antananarivo', timezones: ['Indian/Antananarivo'] },
  { name: 'Malawi', code: 'MW', primaryTimezone: 'Africa/Blantyre', timezones: ['Africa/Blantyre'] },
  { name: 'Malaysia', code: 'MY', primaryTimezone: 'Asia/Kuala_Lumpur', timezones: ['Asia/Kuala_Lumpur', 'Asia/Kuching'] },
  { name: 'Maldives', code: 'MV', primaryTimezone: 'Indian/Maldives', timezones: ['Indian/Maldives'] },
  { name: 'Mali', code: 'ML', primaryTimezone: 'Africa/Bamako', timezones: ['Africa/Bamako'] },
  { name: 'Malta', code: 'MT', primaryTimezone: 'Europe/Malta', timezones: ['Europe/Malta'] },
  { name: 'Mauritania', code: 'MR', primaryTimezone: 'Africa/Nouakchott', timezones: ['Africa/Nouakchott'] },
  { name: 'Mauritius', code: 'MU', primaryTimezone: 'Indian/Mauritius', timezones: ['Indian/Mauritius'] },
  { name: 'Mexico', code: 'MX', primaryTimezone: 'America/Mexico_City', timezones: ['America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Tijuana', 'America/Hermosillo'] },
  { name: 'Moldova', code: 'MD', primaryTimezone: 'Europe/Chisinau', timezones: ['Europe/Chisinau'] },
  { name: 'Monaco', code: 'MC', primaryTimezone: 'Europe/Monaco', timezones: ['Europe/Monaco'] },
  { name: 'Mongolia', code: 'MN', primaryTimezone: 'Asia/Ulaanbaatar', timezones: ['Asia/Ulaanbaatar', 'Asia/Hovd'] },
  { name: 'Montenegro', code: 'ME', primaryTimezone: 'Europe/Podgorica', timezones: ['Europe/Podgorica'] },
  { name: 'Morocco', code: 'MA', primaryTimezone: 'Africa/Casablanca', timezones: ['Africa/Casablanca'] },
  { name: 'Mozambique', code: 'MZ', primaryTimezone: 'Africa/Maputo', timezones: ['Africa/Maputo'] },
  { name: 'Myanmar', code: 'MM', primaryTimezone: 'Asia/Yangon', timezones: ['Asia/Yangon'] },
  { name: 'Namibia', code: 'NA', primaryTimezone: 'Africa/Windhoek', timezones: ['Africa/Windhoek'] },
  { name: 'Nepal', code: 'NP', primaryTimezone: 'Asia/Kathmandu', timezones: ['Asia/Kathmandu'] },
  { name: 'Netherlands', code: 'NL', primaryTimezone: 'Europe/Amsterdam', timezones: ['Europe/Amsterdam'] },
  { name: 'New Zealand', code: 'NZ', primaryTimezone: 'Pacific/Auckland', timezones: ['Pacific/Auckland', 'Pacific/Chatham'] },
  { name: 'Nicaragua', code: 'NI', primaryTimezone: 'America/Managua', timezones: ['America/Managua'] },
  { name: 'Niger', code: 'NE', primaryTimezone: 'Africa/Niamey', timezones: ['Africa/Niamey'] },
  { name: 'Nigeria', code: 'NG', primaryTimezone: 'Africa/Lagos', timezones: ['Africa/Lagos'] },
  { name: 'North Macedonia', code: 'MK', primaryTimezone: 'Europe/Skopje', timezones: ['Europe/Skopje'] },
  { name: 'Norway', code: 'NO', primaryTimezone: 'Europe/Oslo', timezones: ['Europe/Oslo'] },
  { name: 'Oman', code: 'OM', primaryTimezone: 'Asia/Muscat', timezones: ['Asia/Muscat'] },
  { name: 'Pakistan', code: 'PK', primaryTimezone: 'Asia/Karachi', timezones: ['Asia/Karachi'] },
  { name: 'Panama', code: 'PA', primaryTimezone: 'America/Panama', timezones: ['America/Panama'] },
  { name: 'Papua New Guinea', code: 'PG', primaryTimezone: 'Pacific/Port_Moresby', timezones: ['Pacific/Port_Moresby'] },
  { name: 'Paraguay', code: 'PY', primaryTimezone: 'America/Asuncion', timezones: ['America/Asuncion'] },
  { name: 'Peru', code: 'PE', primaryTimezone: 'America/Lima', timezones: ['America/Lima'] },
  { name: 'Philippines', code: 'PH', primaryTimezone: 'Asia/Manila', timezones: ['Asia/Manila'] },
  { name: 'Poland', code: 'PL', primaryTimezone: 'Europe/Warsaw', timezones: ['Europe/Warsaw'] },
  { name: 'Portugal', code: 'PT', primaryTimezone: 'Europe/Lisbon', timezones: ['Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira'] },
  { name: 'Qatar', code: 'QA', primaryTimezone: 'Asia/Qatar', timezones: ['Asia/Qatar'] },
  { name: 'Romania', code: 'RO', primaryTimezone: 'Europe/Bucharest', timezones: ['Europe/Bucharest'] },
  { name: 'Russia', code: 'RU', primaryTimezone: 'Europe/Moscow', timezones: ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan'] },
  { name: 'Rwanda', code: 'RW', primaryTimezone: 'Africa/Kigali', timezones: ['Africa/Kigali'] },
  { name: 'Saudi Arabia', code: 'SA', primaryTimezone: 'Asia/Riyadh', timezones: ['Asia/Riyadh'] },
  { name: 'Senegal', code: 'SN', primaryTimezone: 'Africa/Dakar', timezones: ['Africa/Dakar'] },
  { name: 'Serbia', code: 'RS', primaryTimezone: 'Europe/Belgrade', timezones: ['Europe/Belgrade'] },
  { name: 'Singapore', code: 'SG', primaryTimezone: 'Asia/Singapore', timezones: ['Asia/Singapore'] },
  { name: 'Slovakia', code: 'SK', primaryTimezone: 'Europe/Bratislava', timezones: ['Europe/Bratislava'] },
  { name: 'Slovenia', code: 'SI', primaryTimezone: 'Europe/Ljubljana', timezones: ['Europe/Ljubljana'] },
  { name: 'South Africa', code: 'ZA', primaryTimezone: 'Africa/Johannesburg', timezones: ['Africa/Johannesburg'] },
  { name: 'South Korea', code: 'KR', primaryTimezone: 'Asia/Seoul', timezones: ['Asia/Seoul'] },
  { name: 'Spain', code: 'ES', primaryTimezone: 'Europe/Madrid', timezones: ['Europe/Madrid', 'Atlantic/Canary'] },
  { name: 'Sri Lanka', code: 'LK', primaryTimezone: 'Asia/Colombo', timezones: ['Asia/Colombo'] },
  { name: 'Sudan', code: 'SD', primaryTimezone: 'Africa/Khartoum', timezones: ['Africa/Khartoum'] },
  { name: 'Sweden', code: 'SE', primaryTimezone: 'Europe/Stockholm', timezones: ['Europe/Stockholm'] },
  { name: 'Switzerland', code: 'CH', primaryTimezone: 'Europe/Zurich', timezones: ['Europe/Zurich'] },
  { name: 'Taiwan', code: 'TW', primaryTimezone: 'Asia/Taipei', timezones: ['Asia/Taipei'] },
  { name: 'Tajikistan', code: 'TJ', primaryTimezone: 'Asia/Dushanbe', timezones: ['Asia/Dushanbe'] },
  { name: 'Tanzania', code: 'TZ', primaryTimezone: 'Africa/Dar_es_Salaam', timezones: ['Africa/Dar_es_Salaam'] },
  { name: 'Thailand', code: 'TH', primaryTimezone: 'Asia/Bangkok', timezones: ['Asia/Bangkok'] },
  { name: 'Togo', code: 'TG', primaryTimezone: 'Africa/Lome', timezones: ['Africa/Lome'] },
  { name: 'Trinidad and Tobago', code: 'TT', primaryTimezone: 'America/Port_of_Spain', timezones: ['America/Port_of_Spain'] },
  { name: 'Tunisia', code: 'TN', primaryTimezone: 'Africa/Tunis', timezones: ['Africa/Tunis'] },
  { name: 'Turkey', code: 'TR', primaryTimezone: 'Europe/Istanbul', timezones: ['Europe/Istanbul'] },
  { name: 'Turkmenistan', code: 'TM', primaryTimezone: 'Asia/Ashgabat', timezones: ['Asia/Ashgabat'] },
  { name: 'Uganda', code: 'UG', primaryTimezone: 'Africa/Kampala', timezones: ['Africa/Kampala'] },
  { name: 'Ukraine', code: 'UA', primaryTimezone: 'Europe/Kyiv', timezones: ['Europe/Kyiv'] },
  { name: 'United Arab Emirates', code: 'AE', primaryTimezone: 'Asia/Dubai', timezones: ['Asia/Dubai'] },
  { name: 'United Kingdom', code: 'GB', primaryTimezone: 'Europe/London', timezones: ['Europe/London'] },
  { name: 'United States', code: 'US', primaryTimezone: 'America/New_York', timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'America/Detroit', 'America/Indiana/Indianapolis'] },
  { name: 'Uruguay', code: 'UY', primaryTimezone: 'America/Montevideo', timezones: ['America/Montevideo'] },
  { name: 'Uzbekistan', code: 'UZ', primaryTimezone: 'Asia/Tashkent', timezones: ['Asia/Tashkent'] },
  { name: 'Venezuela', code: 'VE', primaryTimezone: 'America/Caracas', timezones: ['America/Caracas'] },
  { name: 'Vietnam', code: 'VN', primaryTimezone: 'Asia/Ho_Chi_Minh', timezones: ['Asia/Ho_Chi_Minh'] },
  { name: 'Yemen', code: 'YE', primaryTimezone: 'Asia/Aden', timezones: ['Asia/Aden'] },
  { name: 'Zambia', code: 'ZM', primaryTimezone: 'Africa/Lusaka', timezones: ['Africa/Lusaka'] },
  { name: 'Zimbabwe', code: 'ZW', primaryTimezone: 'Africa/Harare', timezones: ['Africa/Harare'] },
];

/**
 * Automatically detects the user's browser timezone and matches it to the corresponding country.
 */
export function getAutoDetectedCountryAndTz(): { country: string; timezone: string } {
  try {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (userTz) {
      // 1. Direct match on timezones list
      const matched = COUNTRIES.find((c) => c.timezones.includes(userTz) || c.primaryTimezone === userTz);
      if (matched) {
        return { country: matched.name, timezone: userTz };
      }
      // 2. Prefix match (e.g. Asia/..., Europe/..., America/...)
      const prefix = userTz.split('/')[0];
      const fallback = COUNTRIES.find((c) => c.primaryTimezone.startsWith(prefix));
      if (fallback) {
        return { country: fallback.name, timezone: userTz };
      }
      return { country: 'United States', timezone: userTz };
    }
  } catch {
    // fallback
  }
  return { country: 'United States', timezone: 'America/New_York' };
}

/**
 * Resolves the primary timezone and all available timezones for a given country name.
 */
export function getTimezonesForCountry(countryName: string): { primary: string; all: string[] } {
  const found = COUNTRIES.find((c) => c.name.toLowerCase() === countryName.trim().toLowerCase());
  if (found) {
    return { primary: found.primaryTimezone, all: found.timezones };
  }
  return { primary: 'UTC', all: ['UTC'] };
}
