/**
 * Bidirectional English common nicknames map.
 *
 * Each key and each value is stored in normalized form: lowercase, no
 * punctuation, no spaces. Lookups work in both directions so a single
 * consumer doesn't need to know which form the CSV uses.
 *
 * Scope: ~150 of the most common English first-name nickname pairs. The
 * list is intentionally hand-curated rather than pulled from a package —
 * determinism and ease of review in code review beats raw coverage.
 *
 * To add a pair: add BOTH directions. Example adding Ted↔Edward:
 *   ted: ['edward', 'teddy'],
 *   edward: ['ted', 'eddie', 'ed', 'teddy'],
 *
 * Do not auto-generate this file. Every addition should be a deliberate
 * human decision because false positives (e.g. "Al" matching both Albert
 * AND Alfred AND Alex) cause silent data corruption in supervisor
 * resolution.
 */
export const NICKNAMES: Record<string, string[]> = {
  // A
  abby: ['abigail'],
  abigail: ['abby', 'gail'],
  al: ['albert', 'alfred', 'alex', 'alan'],
  alan: ['al'],
  albert: ['al', 'bert', 'bertie'],
  alex: ['alexander', 'alexandra', 'al', 'lex'],
  alexander: ['alex', 'xander', 'sandy'],
  alexandra: ['alex', 'sandra', 'sandy', 'ali'],
  alfred: ['al', 'fred', 'alf'],
  allie: ['alison', 'alice'],
  amanda: ['mandy', 'manda'],
  andrew: ['andy', 'drew'],
  andy: ['andrew'],
  anthony: ['tony', 'ant'],
  anton: ['tony'],
  arthur: ['art', 'artie'],

  // B
  barb: ['barbara'],
  barbara: ['barb', 'barbie'],
  becky: ['rebecca'],
  ben: ['benjamin', 'benedict'],
  benjamin: ['ben', 'benny', 'benji'],
  bernard: ['bernie', 'bern'],
  bert: ['albert', 'robert', 'herbert'],
  beth: ['elizabeth', 'bethany'],
  betsy: ['elizabeth'],
  betty: ['elizabeth'],
  bill: ['william', 'billy'],
  billy: ['william', 'bill'],
  bob: ['robert', 'bobby'],
  bobby: ['robert', 'bob'],
  brad: ['bradley', 'bradford'],
  bradley: ['brad'],

  // C
  cal: ['calvin'],
  calvin: ['cal'],
  cam: ['cameron'],
  cameron: ['cam'],
  carl: ['carlton', 'charles'],
  cat: ['catherine', 'cathy'],
  cath: ['catherine'],
  catherine: ['cathy', 'cat', 'kate', 'katie', 'kathy'],
  cathy: ['catherine'],
  charles: ['charlie', 'chuck', 'chas', 'carl'],
  charlie: ['charles', 'charlotte'],
  charlotte: ['charlie', 'lottie', 'char'],
  chris: ['christopher', 'christine', 'christina', 'christian'],
  christian: ['chris'],
  christina: ['chris', 'tina', 'christine'],
  christine: ['chris', 'chrissy', 'tina'],
  christopher: ['chris', 'topher', 'kit'],
  chuck: ['charles'],
  cindy: ['cynthia', 'lucinda'],
  connie: ['constance'],
  constance: ['connie'],
  cynthia: ['cindy'],

  // D
  dan: ['daniel'],
  daniel: ['dan', 'danny'],
  danny: ['daniel', 'dan'],
  dave: ['david'],
  david: ['dave', 'davey'],
  deb: ['deborah', 'debra'],
  debbie: ['deborah', 'debra'],
  deborah: ['deb', 'debbie', 'debra'],
  debra: ['deb', 'debbie'],
  dennis: ['denny'],
  dick: ['richard'],
  don: ['donald'],
  donald: ['don', 'donny'],
  dot: ['dorothy'],
  dorothy: ['dot', 'dottie'],
  doug: ['douglas'],
  douglas: ['doug'],
  drew: ['andrew'],

  // E
  ed: ['edward', 'edwin', 'edgar', 'edmund'],
  eddie: ['edward'],
  edward: ['ed', 'eddie', 'ted', 'ned'],
  edwin: ['ed', 'eddie'],
  eli: ['elijah', 'elias'],
  elizabeth: ['liz', 'beth', 'betty', 'betsy', 'eliza', 'lizzie', 'libby'],
  ellie: ['eleanor', 'elena', 'ellen'],
  emily: ['em', 'emmy'],
  eric: ['rick'],

  // F
  fran: ['frances', 'francis', 'francesca'],
  frances: ['fran', 'franny', 'francie'],
  francis: ['fran', 'frank', 'frankie'],
  frank: ['francis', 'franklin', 'frankie'],
  franklin: ['frank'],
  fred: ['frederick', 'alfred'],
  freddie: ['frederick', 'alfred'],
  frederick: ['fred', 'freddie', 'rick'],

  // G
  gabby: ['gabriel', 'gabrielle'],
  gabriel: ['gabe', 'gabby'],
  gail: ['abigail'],
  geoff: ['geoffrey'],
  geoffrey: ['geoff'],
  george: ['georgie'],
  gerald: ['gerry', 'jerry'],
  gerry: ['gerald', 'gerard'],
  greg: ['gregory'],
  gregory: ['greg'],

  // H
  hank: ['henry', 'harold'],
  harold: ['hal', 'harry'],
  harry: ['harold', 'henry'],
  helen: ['nell', 'nellie'],
  henry: ['hank', 'harry'],

  // I
  isabel: ['izzy', 'bella'],
  isabella: ['izzy', 'bella', 'belle'],

  // J
  jack: ['john', 'jackson'],
  jackie: ['jacqueline', 'jackson'],
  jacqueline: ['jackie', 'jacqui'],
  jake: ['jacob'],
  jacob: ['jake', 'jay'],
  james: ['jim', 'jimmy', 'jamie'],
  jamie: ['james', 'jamison'],
  jane: ['janie'],
  jay: ['jacob', 'jason', 'james'],
  jeff: ['jeffrey', 'jefferson'],
  jeffrey: ['jeff'],
  jen: ['jennifer'],
  jennifer: ['jen', 'jenny'],
  jenny: ['jennifer'],
  jerry: ['gerald', 'jerome'],
  jess: ['jessica', 'jesse', 'jessamyn'],
  jesse: ['jess'],
  jessica: ['jess', 'jessie'],
  jim: ['james'],
  jimmy: ['james'],
  jo: ['joseph', 'joanne', 'joan', 'joanna', 'josephine'],
  joe: ['joseph'],
  joey: ['joseph'],
  john: ['jack', 'johnny', 'jon'],
  jon: ['jonathan', 'john'],
  jonathan: ['jon', 'jonny', 'jonty'],
  joseph: ['joe', 'joey', 'jo'],
  joshua: ['josh'],
  josh: ['joshua'],
  judy: ['judith'],
  judith: ['judy'],
  julie: ['julia', 'juliet', 'juliana'],

  // K
  kate: ['katherine', 'kathleen', 'katrina'],
  katie: ['katherine', 'kathleen'],
  kathleen: ['kate', 'katie', 'kathy'],
  kathy: ['katherine', 'kathleen'],
  katherine: ['kate', 'katie', 'kathy', 'kitty'],
  ken: ['kenneth'],
  kenneth: ['ken', 'kenny'],
  kim: ['kimberly', 'kimberley'],
  kimberly: ['kim'],
  kit: ['christopher', 'katherine'],

  // L
  larry: ['lawrence'],
  lawrence: ['larry', 'laurence'],
  laurence: ['laurie', 'larry'],
  len: ['leonard', 'leon'],
  leon: ['leo', 'len'],
  leonard: ['len', 'lenny', 'leo'],
  leo: ['leonardo', 'leonard'],
  les: ['leslie', 'lester'],
  lily: ['lillian'],
  lillian: ['lily'],
  liz: ['elizabeth'],
  lou: ['louis', 'louise', 'lewis'],
  louis: ['lou', 'louie'],

  // M
  maggie: ['margaret'],
  mandy: ['amanda'],
  marge: ['margaret'],
  margaret: ['maggie', 'marge', 'peggy', 'meg', 'greta'],
  mark: ['marcus'],
  marty: ['martin', 'martha'],
  martin: ['marty'],
  matt: ['matthew'],
  matthew: ['matt', 'matty'],
  max: ['maxwell', 'maximilian', 'maxine'],
  maxwell: ['max'],
  meg: ['margaret', 'megan'],
  megan: ['meg'],
  mel: ['melissa', 'melanie', 'melvin'],
  melissa: ['mel', 'missy'],
  michael: ['mike', 'mick', 'mikey'],
  michelle: ['shelly', 'shell'],
  mike: ['michael'],
  mitch: ['mitchell'],
  mitchell: ['mitch'],
  mo: ['maurice', 'monroe', 'morris'],
  molly: ['mary', 'margaret'],

  // N
  nancy: ['ann', 'anne', 'annie'],
  nate: ['nathan', 'nathaniel'],
  nathan: ['nate'],
  nathaniel: ['nate', 'nat'],
  ned: ['edward'],
  nell: ['helen', 'eleanor'],
  nick: ['nicholas', 'nicolas', 'nikolai'],
  nicholas: ['nick', 'nicky'],
  nina: ['antonina'],

  // O
  ollie: ['oliver', 'olivia'],
  oliver: ['ollie'],

  // P
  pam: ['pamela'],
  pamela: ['pam'],
  pat: ['patrick', 'patricia'],
  patricia: ['pat', 'patty', 'tricia', 'trish'],
  patrick: ['pat', 'paddy', 'rick'],
  patty: ['patricia'],
  peggy: ['margaret'],
  pete: ['peter'],
  peter: ['pete'],
  phil: ['philip', 'phillip'],
  philip: ['phil'],
  phillip: ['phil'],

  // R
  ralph: ['ralphie'],
  randy: ['randall', 'randolph'],
  ray: ['raymond'],
  raymond: ['ray'],
  rebecca: ['becky', 'becca'],
  rich: ['richard'],
  richard: ['rick', 'rich', 'dick', 'richie'],
  rick: ['richard', 'eric', 'frederick'],
  rob: ['robert'],
  robert: ['rob', 'bob', 'bobby', 'bert', 'robbie'],
  ron: ['ronald'],
  ronald: ['ron', 'ronnie'],
  russ: ['russell'],
  russell: ['russ'],

  // S
  sal: ['salvatore'],
  sam: ['samuel', 'samantha'],
  samantha: ['sam', 'sammy'],
  samuel: ['sam', 'sammy'],
  sandra: ['sandy', 'alexandra'],
  sandy: ['sandra', 'alexander'],
  stan: ['stanley'],
  stanley: ['stan'],
  steve: ['stephen', 'steven'],
  stephen: ['steve', 'stevie'],
  steven: ['steve', 'stevie'],
  sue: ['susan', 'susanna'],
  susan: ['sue', 'susie', 'suzy'],

  // T
  ted: ['theodore', 'edward'],
  teddy: ['theodore', 'edward'],
  terry: ['terence', 'theresa'],
  theodore: ['ted', 'teddy', 'theo'],
  theo: ['theodore'],
  theresa: ['terry', 'tess', 'tessa'],
  tim: ['timothy'],
  timothy: ['tim'],
  tina: ['christina', 'martina', 'valentina'],
  tom: ['thomas'],
  thomas: ['tom', 'tommy'],
  tony: ['anthony', 'antonio'],
  tricia: ['patricia'],
  trish: ['patricia'],

  // V
  val: ['valerie', 'valentine'],
  vic: ['victor', 'victoria'],
  vicky: ['victoria'],
  victoria: ['vicky', 'tori'],

  // W
  walt: ['walter'],
  walter: ['walt'],
  will: ['william', 'wilbur'],
  william: ['will', 'bill', 'billy', 'willy', 'liam'],
  willy: ['william'],

  // Z
  zach: ['zachary', 'zacharias'],
  zachary: ['zach'],
}

/**
 * Return the set of possible canonical first names for a given normalized
 * input, INCLUDING the input itself. Useful for expanding a fuzzy-match
 * search space — "mike" expands to {mike, michael, mick, mikey}.
 */
export function expandNickname(normalized: string): Set<string> {
  const out = new Set<string>()
  if (!normalized) return out
  out.add(normalized)
  const direct = NICKNAMES[normalized]
  if (direct) {
    for (const alt of direct) out.add(alt)
  }
  return out
}
