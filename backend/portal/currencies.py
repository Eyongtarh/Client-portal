# Country -> ISO 4217 currency code, for the owner's "Country"
# picker (see WorkspaceSerializer.validate_currency and
# views.CountriesView). Letting an owner free-type a currency
# ("FCFA" instead of the actual ISO code "XAF") is how a workspace
# ends up with a value Stripe rejects at checkout time - every
# payment for that business then silently fails for clients. Driving
# currency off a country selection instead means only real ISO 4217
# codes ever reach Stripe.
COUNTRIES = [
    ("AF", "Afghanistan", "AFN"),
    ("AL", "Albania", "ALL"),
    ("DZ", "Algeria", "DZD"),
    ("AD", "Andorra", "EUR"),
    ("AO", "Angola", "AOA"),
    ("AG", "Antigua and Barbuda", "XCD"),
    ("AR", "Argentina", "ARS"),
    ("AM", "Armenia", "AMD"),
    ("AU", "Australia", "AUD"),
    ("AT", "Austria", "EUR"),
    ("AZ", "Azerbaijan", "AZN"),
    ("BS", "Bahamas", "BSD"),
    ("BH", "Bahrain", "BHD"),
    ("BD", "Bangladesh", "BDT"),
    ("BB", "Barbados", "BBD"),
    ("BY", "Belarus", "BYN"),
    ("BE", "Belgium", "EUR"),
    ("BZ", "Belize", "BZD"),
    ("BJ", "Benin", "XOF"),
    ("BT", "Bhutan", "BTN"),
    ("BO", "Bolivia", "BOB"),
    ("BA", "Bosnia and Herzegovina", "BAM"),
    ("BW", "Botswana", "BWP"),
    ("BR", "Brazil", "BRL"),
    ("BN", "Brunei", "BND"),
    ("BG", "Bulgaria", "BGN"),
    ("BF", "Burkina Faso", "XOF"),
    ("BI", "Burundi", "BIF"),
    ("CV", "Cabo Verde", "CVE"),
    ("KH", "Cambodia", "KHR"),
    ("CM", "Cameroon", "XAF"),
    ("CA", "Canada", "CAD"),
    ("CF", "Central African Republic", "XAF"),
    ("TD", "Chad", "XAF"),
    ("CL", "Chile", "CLP"),
    ("CN", "China", "CNY"),
    ("CO", "Colombia", "COP"),
    ("KM", "Comoros", "KMF"),
    ("CG", "Congo (Republic)", "XAF"),
    ("CD", "Congo (DRC)", "CDF"),
    ("CR", "Costa Rica", "CRC"),
    ("HR", "Croatia", "EUR"),
    ("CY", "Cyprus", "EUR"),
    ("CZ", "Czechia", "CZK"),
    ("DK", "Denmark", "DKK"),
    ("DJ", "Djibouti", "DJF"),
    ("DM", "Dominica", "XCD"),
    ("DO", "Dominican Republic", "DOP"),
    ("EC", "Ecuador", "USD"),
    ("EG", "Egypt", "EGP"),
    ("SV", "El Salvador", "USD"),
    ("GQ", "Equatorial Guinea", "XAF"),
    ("EE", "Estonia", "EUR"),
    ("SZ", "Eswatini", "SZL"),
    ("ET", "Ethiopia", "ETB"),
    ("FJ", "Fiji", "FJD"),
    ("FI", "Finland", "EUR"),
    ("FR", "France", "EUR"),
    ("GA", "Gabon", "XAF"),
    ("GM", "Gambia", "GMD"),
    ("GE", "Georgia", "GEL"),
    ("DE", "Germany", "EUR"),
    ("GH", "Ghana", "GHS"),
    ("GR", "Greece", "EUR"),
    ("GD", "Grenada", "XCD"),
    ("GT", "Guatemala", "GTQ"),
    ("GN", "Guinea", "GNF"),
    ("GW", "Guinea-Bissau", "XOF"),
    ("GY", "Guyana", "GYD"),
    ("HT", "Haiti", "HTG"),
    ("HN", "Honduras", "HNL"),
    ("HK", "Hong Kong", "HKD"),
    ("HU", "Hungary", "HUF"),
    ("IS", "Iceland", "ISK"),
    ("IN", "India", "INR"),
    ("ID", "Indonesia", "IDR"),
    ("IE", "Ireland", "EUR"),
    ("IL", "Israel", "ILS"),
    ("IT", "Italy", "EUR"),
    ("CI", "Ivory Coast", "XOF"),
    ("JM", "Jamaica", "JMD"),
    ("JP", "Japan", "JPY"),
    ("JO", "Jordan", "JOD"),
    ("KZ", "Kazakhstan", "KZT"),
    ("KE", "Kenya", "KES"),
    ("KW", "Kuwait", "KWD"),
    ("KG", "Kyrgyzstan", "KGS"),
    ("LA", "Laos", "LAK"),
    ("LV", "Latvia", "EUR"),
    ("LB", "Lebanon", "LBP"),
    ("LS", "Lesotho", "LSL"),
    ("LR", "Liberia", "LRD"),
    ("LI", "Liechtenstein", "CHF"),
    ("LT", "Lithuania", "EUR"),
    ("LU", "Luxembourg", "EUR"),
    ("MG", "Madagascar", "MGA"),
    ("MW", "Malawi", "MWK"),
    ("MY", "Malaysia", "MYR"),
    ("MV", "Maldives", "MVR"),
    ("ML", "Mali", "XOF"),
    ("MT", "Malta", "EUR"),
    ("MR", "Mauritania", "MRO"),
    ("MU", "Mauritius", "MUR"),
    ("MX", "Mexico", "MXN"),
    ("MD", "Moldova", "MDL"),
    ("MC", "Monaco", "EUR"),
    ("MN", "Mongolia", "MNT"),
    ("ME", "Montenegro", "EUR"),
    ("MA", "Morocco", "MAD"),
    ("MZ", "Mozambique", "MZN"),
    ("MM", "Myanmar", "MMK"),
    ("NA", "Namibia", "NAD"),
    ("NP", "Nepal", "NPR"),
    ("NL", "Netherlands", "EUR"),
    ("NZ", "New Zealand", "NZD"),
    ("NI", "Nicaragua", "NIO"),
    ("NE", "Niger", "XOF"),
    ("NG", "Nigeria", "NGN"),
    ("MK", "North Macedonia", "MKD"),
    ("NO", "Norway", "NOK"),
    ("OM", "Oman", "OMR"),
    ("PK", "Pakistan", "PKR"),
    ("PA", "Panama", "USD"),
    ("PG", "Papua New Guinea", "PGK"),
    ("PY", "Paraguay", "PYG"),
    ("PE", "Peru", "PEN"),
    ("PH", "Philippines", "PHP"),
    ("PL", "Poland", "PLN"),
    ("PT", "Portugal", "EUR"),
    ("QA", "Qatar", "QAR"),
    ("RO", "Romania", "RON"),
    ("RU", "Russia", "RUB"),
    ("RW", "Rwanda", "RWF"),
    ("KN", "Saint Kitts and Nevis", "XCD"),
    ("LC", "Saint Lucia", "XCD"),
    ("VC", "Saint Vincent and the Grenadines", "XCD"),
    ("WS", "Samoa", "WST"),
    ("SM", "San Marino", "EUR"),
    ("SA", "Saudi Arabia", "SAR"),
    ("SN", "Senegal", "XOF"),
    ("RS", "Serbia", "RSD"),
    ("SC", "Seychelles", "SCR"),
    ("SL", "Sierra Leone", "SLL"),
    ("SG", "Singapore", "SGD"),
    ("SK", "Slovakia", "EUR"),
    ("SI", "Slovenia", "EUR"),
    ("SB", "Solomon Islands", "SBD"),
    ("SO", "Somalia", "SOS"),
    ("ZA", "South Africa", "ZAR"),
    ("KR", "South Korea", "KRW"),
    ("ES", "Spain", "EUR"),
    ("LK", "Sri Lanka", "LKR"),
    ("SR", "Suriname", "SRD"),
    ("SE", "Sweden", "SEK"),
    ("CH", "Switzerland", "CHF"),
    ("TW", "Taiwan", "TWD"),
    ("TJ", "Tajikistan", "TJS"),
    ("TZ", "Tanzania", "TZS"),
    ("TH", "Thailand", "THB"),
    ("TL", "Timor-Leste", "USD"),
    ("TG", "Togo", "XOF"),
    ("TO", "Tonga", "TOP"),
    ("TT", "Trinidad and Tobago", "TTD"),
    ("TN", "Tunisia", "TND"),
    ("TR", "Turkey", "TRY"),
    ("UG", "Uganda", "UGX"),
    ("UA", "Ukraine", "UAH"),
    ("AE", "United Arab Emirates", "AED"),
    ("GB", "United Kingdom", "GBP"),
    ("US", "United States", "USD"),
    ("UY", "Uruguay", "UYU"),
    ("UZ", "Uzbekistan", "UZS"),
    ("VU", "Vanuatu", "VUV"),
    ("VN", "Vietnam", "VND"),
    ("YE", "Yemen", "YER"),
    ("ZM", "Zambia", "ZMW"),
]

VALID_CURRENCIES = frozenset(currency for _, _, currency in COUNTRIES)

# Stripe's `amount`/`unit_amount` API fields are always an integer in
# the currency's smallest unit - for most currencies that's cents,
# i.e. major-unit * 100, but not universally. Several currencies in
# COUNTRIES above (e.g. Cameroon/Chad/Gabon's XAF) have no minor
# unit at all, so sending amount*100 to Stripe would charge a real
# customer 100x the intended amount. Verified directly against
# https://docs.stripe.com/currencies as of 2026-09 rather than
# assumed - notably UGX and ISK are colloquially "zero-decimal" but
# Stripe explicitly keeps them on the *100 (2-decimal) path for
# backward compatibility, so they're deliberately NOT in this set
# despite showing up in most third-party "zero-decimal currency"
# lists floating around online.
ZERO_DECIMAL_CURRENCIES = frozenset({
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
    "RWF", "VND", "VUV", "XAF", "XOF", "XPF",
})

# Currencies whose minor unit is a thousandth rather than a
# hundredth (Bahrain/Jordan/Kuwait/Oman/Tunisia use 3-decimal
# dinars/rials) - Stripe's `amount` is still "the smallest unit", so
# these need *1000, not *100.
THREE_DECIMAL_CURRENCIES = frozenset({"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"})


def to_stripe_amount(amount, currency):
    """Converts a Decimal/float major-unit amount (e.g. Decimal("45.00")
    for 45 XAF or 45.00 EUR - however the rest of the app already
    stores and displays money) into the integer Stripe's API expects
    for that specific currency's `amount`/`unit_amount` fields.
    """
    code = currency.upper()
    if code in ZERO_DECIMAL_CURRENCIES:
        return int(round(amount))
    if code in THREE_DECIMAL_CURRENCIES:
        return int(round(amount * 1000))
    return int(round(amount * 100))
