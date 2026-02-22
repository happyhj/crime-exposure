import type { NibrsCategory } from './types.js';

/**
 * NIBRS code → category mapping.
 * Based on FBI NIBRS specification.
 * Group A offenses (71 codes) classified into 4 categories.
 */

const VIOLENT_CODES = new Set([
  '09A', '09B', '09C',           // Homicide
  '100',                          // Kidnapping/Abduction
  '11A', '11B', '11C', '11D',    // Sex Offenses
  '120',                          // Robbery
  '13A', '13B', '13C',           // Assault
  '36A', '36B',                   // Extortion/Intimidation
  '64A', '64B',                   // Human Trafficking
]);

const PROPERTY_CODES = new Set([
  '200',                          // Arson
  '210',                          // Extortion/Blackmail
  '220',                          // Burglary/Breaking & Entering
  '23A', '23B', '23C', '23D',    // Larceny/Theft
  '23E', '23F', '23G', '23H',
  '240',                          // Motor Vehicle Theft
  '250',                          // Counterfeiting/Forgery
  '26A', '26B', '26C', '26D', '26E', '26F', '26G', '26H', // Fraud
  '270',                          // Embezzlement
  '280',                          // Stolen Property
  '290',                          // Destruction/Damage/Vandalism
]);

const SOCIETY_CODES = new Set([
  '35A', '35B',                   // Drug/Narcotic
  '370',                          // Pornography/Obscene Material
  '39A', '39B', '39C', '39D',    // Gambling
  '40A', '40B', '40C',           // Prostitution
  '520',                          // Weapon Law Violations
  '720',                          // Animal Cruelty
]);

export function classifyNibrsCode(code: string): NibrsCategory {
  if (VIOLENT_CODES.has(code)) return 'Violent';
  if (PROPERTY_CODES.has(code)) return 'Property';
  if (SOCIETY_CODES.has(code)) return 'Society';
  return 'Other';
}
