import type { SpeakingItem } from "./speaking-kit";

/**
 * Speaking Builder: an answer assembled step by step. Each step offers two or
 * three ideas (Vietnamese idea + English phrase); picking one adds a full
 * English sentence. The first step is read from the question itself, the rest
 * come from an original idea bank by topic, so it works for every question in
 * the bank without calling an AI. Later steps follow the stance of the first
 * (a "no" is followed by reasons against, not for).
 */
export type Tone = "pos" | "neg" | "mix";
export type BuilderOption = { vi: string; en: string; sentence: string; tone?: Tone; blank?: string };
export type BuilderStep = { id: string; label: string; hint: string; options: BuilderOption[] };

type Idea = { vi: string; en: string; me: string; all: string };
type Bank = { reasonsPos: Idea[]; reasonsNeg: Idea[]; examples: Idea[]; endPos: Idea[]; endNeg: Idea[]; describe: Idea[] };

const idea = (vi: string, en: string, me: string, all: string): Idea => ({ vi, en, me, all });

/** Original ideas for each theme; "me" sentences answer Part 1/2, "all" sentences answer Part 3. */
const banks: Record<string, Bank> = {
  education: {
    reasonsPos: [
      idea("có ích cho công việc sau này", "useful for my future career", "I think it will be really useful for my future career.", "A good education opens far more doors when people look for work later on."),
      idea("học được cách tư duy", "learn how to think", "It has taught me how to think things through instead of just memorising facts.", "Studying properly teaches people how to think critically rather than just memorise facts."),
      idea("gặp bạn bè cùng chí hướng", "meet like-minded people", "I also get to meet a lot of like-minded people, which keeps me motivated.", "Schools also bring together like-minded people who push each other to do better."),
    ],
    reasonsNeg: [
      idea("quá nhiều lý thuyết", "too much theory", "Honestly, there's far too much theory and not enough real practice.", "The problem is that there is often too much theory and too little real practice."),
      idea("áp lực thi cử", "exam pressure", "The exam pressure can be quite overwhelming at times.", "Constant exam pressure can take away the joy of learning for many students."),
    ],
    examples: [
      idea("dự án nhóm ở trường", "a group project at school", "For example, last semester we did a group project that taught me more than any lecture.", "For instance, many Vietnamese universities now use group projects to build teamwork skills."),
      idea("học online sau giờ học", "online courses after class", "For instance, I take short online courses in the evening to fill the gaps.", "Take online courses, for example: they let people learn at their own pace after work."),
      idea("kỳ thi quan trọng", "an important exam", "I remember preparing for a big exam and studying until midnight every day.", "The national high school exam in Vietnam is a good example of how much weight is put on tests."),
    ],
    endPos: [
      idea("đáng để đầu tư", "worth the effort", "So overall, it's definitely worth the effort.", "So overall, investing in education is always worth it in the long run."),
      idea("muốn học thêm nữa", "keen to learn more", "That's why I'm keen to keep learning as much as I can.", "That's why I believe lifelong learning will matter even more in the future."),
    ],
    endNeg: [
      idea("cần thay đổi cách dạy", "teaching needs to change", "So I hope the way it's taught will change a bit in the future.", "So I think the way we teach and test needs to change."),
    ],
    describe: [
      idea("rộng rãi, nhiều cây xanh", "spacious with lots of greenery", "It's quite spacious, with lots of trees and quiet corners to study in.", "It's quite spacious, with lots of trees and quiet corners to study in."),
      idea("hiện đại, đầy đủ thiết bị", "modern and well-equipped", "It's very modern and well-equipped, so studying there is comfortable.", "It's very modern and well-equipped, so studying there is comfortable."),
    ],
  },
  work: {
    reasonsPos: [
      idea("tích lũy kinh nghiệm thực tế", "gain practical experience", "It lets me gain practical experience that I can't get from books.", "Work gives people practical experience that no classroom can provide."),
      idea("tự chủ tài chính", "be financially independent", "It also means I can be financially independent and support myself.", "Having a job allows people to be financially independent and plan their future."),
      idea("đồng nghiệp tốt", "supportive colleagues", "I'm lucky to have supportive colleagues who help me whenever I'm stuck.", "A supportive team makes a huge difference to how satisfied people feel at work."),
    ],
    reasonsNeg: [
      idea("làm thêm giờ nhiều", "long working hours", "The main downside is the long working hours, which leave me exhausted.", "Long working hours are a real problem, and they hurt people's health and family life."),
      idea("công việc lặp lại", "repetitive tasks", "A lot of the tasks are quite repetitive, so it can get boring.", "Many jobs involve repetitive tasks, which can make people lose motivation."),
    ],
    examples: [
      idea("công việc làm thêm", "my part-time job", "For example, at my part-time job I learned how to deal with difficult customers.", "For example, a lot of students in Vietnam work part-time in cafés to earn extra money."),
      idea("một dự án gần đây", "a recent project", "Just last month, I finished a project that I'm really proud of.", "Take remote work, for instance: it became common in many companies after 2020."),
    ],
    endPos: [
      idea("bận nhưng xứng đáng", "busy but rewarding", "It's quite busy, but it's incredibly rewarding.", "So overall, meaningful work is one of the biggest sources of satisfaction in life."),
      idea("muốn gắn bó lâu dài", "stay for the long term", "That's why I'd like to stay in this field for the long term.", "That's why I think job satisfaction matters more than salary in the long run."),
    ],
    endNeg: [
      idea("có thể sẽ đổi việc", "might change jobs", "So I might look for something different in the next few years.", "So I believe companies need to improve working conditions to keep good staff."),
    ],
    describe: [
      idea("văn phòng yên tĩnh", "a quiet office", "It's a fairly quiet office with big windows and a lot of natural light.", "It's a fairly quiet office with big windows and a lot of natural light."),
      idea("nhịp độ nhanh", "fast-paced", "It's a fast-paced place where every day is a little different.", "It's a fast-paced place where every day is a little different."),
    ],
  },
  technology: {
    reasonsPos: [
      idea("tiết kiệm thời gian", "save time", "It saves me a lot of time in my daily life.", "Technology saves people an enormous amount of time on everyday tasks."),
      idea("kết nối với mọi người", "stay connected", "It helps me stay connected with friends and family who live far away.", "It allows people to stay connected with others no matter where they live."),
      idea("học được nhiều thứ mới", "learn new things", "I can learn new things online whenever I want.", "The internet has made knowledge available to almost everyone."),
    ],
    reasonsNeg: [
      idea("dễ bị xao nhãng", "easily distracted", "The problem is that I get distracted far too easily.", "The downside is that people are constantly distracted by notifications."),
      idea("lo ngại quyền riêng tư", "privacy concerns", "I'm also a bit worried about how much of my data is collected.", "There are serious privacy concerns about how companies use personal data."),
    ],
    examples: [
      idea("ứng dụng trên điện thoại", "apps on my phone", "For example, I use an app to plan my day and track my spending.", "For instance, most people in Vietnam now pay for things with QR codes on their phones."),
      idea("học online", "online learning", "Just recently, I took an online course that helped me a lot.", "Online learning is a good example: millions of students studied from home during the pandemic."),
    ],
    endPos: [
      idea("không thể thiếu", "can't live without it", "To be honest, I can't imagine my life without it now.", "So overall, technology has made life far more convenient."),
      idea("dùng có chừng mực", "use it wisely", "I just try to use it wisely and not let it control me.", "The key is to use it wisely rather than avoid it."),
    ],
    endNeg: [
      idea("muốn dùng ít đi", "want to use it less", "So I'm trying to spend less time on screens these days.", "So I think we need clearer rules on how technology is used."),
    ],
    describe: [
      idea("dễ dùng, gọn nhẹ", "simple and easy to use", "It's really simple and easy to use, even for beginners.", "It's really simple and easy to use, even for beginners."),
      idea("giao diện đẹp", "a clean design", "It has a clean design, so I can find what I need in seconds.", "It has a clean design, so I can find what I need in seconds."),
    ],
  },
  environment: {
    reasonsPos: [
      idea("không khí trong lành", "fresh air", "I love the fresh air and the feeling of being close to nature.", "Clean air and green spaces have a direct effect on people's health."),
      idea("trách nhiệm với thế hệ sau", "duty to future generations", "I feel we have a duty to protect it for future generations.", "We have a duty to protect the environment for future generations."),
    ],
    reasonsNeg: [
      idea("ô nhiễm ngày càng nặng", "pollution is getting worse", "Sadly, pollution where I live is getting worse every year.", "Unfortunately, pollution is getting worse in many big cities."),
      idea("khó thay đổi thói quen", "habits are hard to change", "Honestly, it's hard to change my habits, like using plastic bags.", "The difficulty is that people's habits are very hard to change."),
    ],
    examples: [
      idea("rác thải nhựa", "plastic waste", "For example, I now bring my own bottle to avoid plastic waste.", "Take plastic waste, for example: it's a huge problem on Vietnam's beaches."),
      idea("trồng cây", "planting trees", "Last year, I joined a tree-planting day in my neighbourhood.", "For instance, some cities have started tree-planting campaigns to fight the heat."),
    ],
    endPos: [
      idea("ai cũng góp một phần", "everyone can do their part", "So I think everyone can do their part, even in small ways.", "So overall, both individuals and governments need to act."),
    ],
    endNeg: [
      idea("cần hành động mạnh hơn", "stronger action is needed", "So I really hope there will be stronger action soon.", "So I believe much stronger action is needed from governments."),
    ],
    describe: [
      idea("xanh mát, yên bình", "green and peaceful", "It's green and peaceful, with a small lake in the middle.", "It's green and peaceful, with a small lake in the middle."),
      idea("đông người vào cuối tuần", "busy at weekends", "It gets quite busy at weekends, especially in the early morning.", "It gets quite busy at weekends, especially in the early morning."),
    ],
  },
  health: {
    reasonsPos: [
      idea("giữ dáng, khỏe mạnh", "stay fit and healthy", "It helps me stay fit and healthy.", "Regular exercise is one of the simplest ways for people to stay healthy."),
      idea("giảm căng thẳng", "relieve stress", "It's also a great way to relieve stress after a long day.", "It also helps people relieve stress, which is a big issue nowadays."),
    ],
    reasonsNeg: [
      idea("không có thời gian", "no time", "To be honest, I just don't have enough time for it.", "Many people simply don't have time because of their busy schedules."),
      idea("đồ ăn nhanh tiện hơn", "fast food is easier", "Fast food is just so much easier when I'm busy.", "Fast food is cheaper and quicker, so it's tempting for busy families."),
    ],
    examples: [
      idea("chạy bộ buổi sáng", "jogging in the morning", "For example, I go jogging in the park three mornings a week.", "For example, you can see crowds of people exercising in Hanoi's parks every morning."),
      idea("nấu ăn ở nhà", "cooking at home", "These days I try to cook at home instead of eating out.", "Cooking at home is a good example of a small change with a big effect on health."),
    ],
    endPos: [
      idea("cảm thấy tràn đầy năng lượng", "feel full of energy", "So I feel full of energy most of the time.", "So overall, prevention is far better than cure."),
    ],
    endNeg: [
      idea("cần cố gắng hơn", "need to try harder", "So I know I need to try harder.", "So I think schools should teach healthy habits from an early age."),
    ],
    describe: [
      idea("sạch sẽ, thoáng mát", "clean and airy", "It's clean and airy, and the staff are really friendly.", "It's clean and airy, and the staff are really friendly."),
    ],
  },
  media: {
    reasonsPos: [
      idea("giúp thư giãn", "help me unwind", "It really helps me unwind after a stressful day.", "Entertainment helps people unwind, which is important for mental health."),
      idea("học thêm tiếng Anh", "improve my English", "It's also a fun way to improve my English.", "Films and music are also a great way to learn about other cultures."),
    ],
    reasonsNeg: [
      idea("tốn nhiều thời gian", "takes up too much time", "The thing is, it can take up far too much of my time.", "The downside is that it can take up too much of people's free time."),
      idea("nhiều thông tin sai", "a lot of fake news", "There's also a lot of misleading content out there.", "There is a lot of fake news, which can mislead people."),
    ],
    examples: [
      idea("một bộ phim gần đây", "a recent film", "For example, I recently watched a film that made me think for days.", "Take Vietnamese films, for example: they're becoming popular abroad."),
      idea("nghe nhạc khi đi xe buýt", "music on the bus", "For instance, I always listen to music on my way to school.", "For instance, many people listen to podcasts while commuting."),
    ],
    endPos: [
      idea("là một phần cuộc sống", "a big part of my life", "So it's become a big part of my life.", "So overall, the media has a huge influence on how we see the world."),
    ],
    endNeg: [
      idea("nên chọn lọc hơn", "be more selective", "So I'm trying to be more selective about what I watch.", "So people need to be more selective about what they believe."),
    ],
    describe: [
      idea("cốt truyện hấp dẫn", "a gripping story", "It has a gripping story and great acting.", "It has a gripping story and great acting."),
    ],
  },
  society: {
    reasonsPos: [
      idea("gắn kết gia đình", "bring the family together", "It brings my family closer together.", "It brings families and communities closer together."),
      idea("giữ gìn truyền thống", "keep traditions alive", "It's a way to keep our traditions alive.", "It helps keep traditional values alive for younger generations."),
    ],
    reasonsNeg: [
      idea("cuộc sống quá bận rộn", "life is too busy", "Life is just too busy these days to keep it up.", "Modern life is so busy that people have less time for each other."),
      idea("khoảng cách thế hệ", "the generation gap", "There's a bit of a generation gap, so we don't always agree.", "The generation gap can lead to misunderstandings within families."),
    ],
    examples: [
      idea("dịp Tết", "Tết holiday", "For example, during Tết my whole family gets together for days.", "Tết is a good example: it's when families across Vietnam reunite."),
      idea("hàng xóm giúp đỡ nhau", "neighbours helping each other", "I remember my neighbours helping us a lot when we moved in.", "In many Vietnamese neighbourhoods, people still help each other a lot."),
    ],
    endPos: [
      idea("rất trân trọng", "really treasure it", "So it's something I really treasure.", "So overall, these connections make society stronger."),
    ],
    endNeg: [
      idea("cần dành thời gian hơn", "need to make more time", "So I think I need to make more time for it.", "So I think we need to make more effort to stay connected."),
    ],
    describe: [
      idea("ấm cúng, thân thiện", "cosy and friendly", "It's a cosy, friendly place where everyone knows each other.", "It's a cosy, friendly place where everyone knows each other."),
    ],
  },
  economy: {
    reasonsPos: [
      idea("tiện lợi, nhiều lựa chọn", "convenient with lots of choice", "It's really convenient and there's so much choice.", "Consumers now have far more choice than ever before."),
      idea("giá cả hợp lý", "reasonable prices", "The prices are quite reasonable, too.", "Competition keeps prices reasonable for ordinary people."),
    ],
    reasonsNeg: [
      idea("dễ tiêu quá tay", "easy to overspend", "The problem is that it's very easy to overspend.", "The problem is that it encourages people to overspend."),
      idea("giá cả tăng", "rising prices", "Prices keep going up, which worries me a bit.", "Rising prices put a lot of pressure on low-income families."),
    ],
    examples: [
      idea("mua sắm online", "online shopping", "For example, I bought my last pair of shoes online at half price.", "For instance, online shopping apps have changed how Vietnamese people buy things."),
      idea("chợ truyền thống", "traditional markets", "I still go to the local market with my mum at weekends.", "Traditional markets in Vietnam are still busy despite big shopping malls."),
    ],
    endPos: [
      idea("khá hài lòng", "quite satisfied", "So overall, I'm quite satisfied with it.", "So overall, a strong economy benefits everyone."),
    ],
    endNeg: [
      idea("cần chi tiêu thông minh", "spend more wisely", "So I'm learning to spend more wisely.", "So I think people should be taught to manage money from a young age."),
    ],
    describe: [
      idea("nhộn nhịp, đầy màu sắc", "busy and colourful", "It's busy and colourful, full of stalls selling everything you can imagine.", "It's busy and colourful, full of stalls selling everything you can imagine."),
    ],
  },
  travel: {
    reasonsPos: [
      idea("khám phá văn hóa mới", "discover new cultures", "I love discovering new cultures and trying local food.", "Travel helps people understand other cultures and become more open-minded."),
      idea("thoát khỏi áp lực", "get away from stress", "It's the best way for me to get away from the stress of daily life.", "It gives people a break from the stress of work."),
    ],
    reasonsNeg: [
      idea("tắc đường", "traffic jams", "The traffic jams are honestly a nightmare.", "Traffic congestion wastes millions of hours every year."),
      idea("tốn kém", "expensive", "It can be quite expensive, so I can't do it often.", "It's still too expensive for many families."),
    ],
    examples: [
      idea("chuyến đi Đà Lạt", "a trip to Đà Lạt", "For example, last summer I went to Đà Lạt and loved the cool weather.", "Take Đà Lạt, for example: it attracts huge numbers of tourists every year."),
      idea("đi xe máy", "riding a motorbike", "Every day I ride my motorbike to school, which takes about twenty minutes.", "In Vietnam, for instance, most people still get around by motorbike."),
    ],
    endPos: [
      idea("muốn đi nhiều hơn", "want to travel more", "So I'd love to travel even more in the future.", "So overall, the benefits of tourism outweigh the drawbacks if it's managed well."),
    ],
    endNeg: [
      idea("cần giao thông công cộng tốt hơn", "need better public transport", "So I really hope public transport gets better.", "So investing in public transport should be a priority."),
    ],
    describe: [
      idea("cảnh đẹp, khí hậu dễ chịu", "beautiful scenery and mild weather", "It has beautiful scenery and the weather is mild all year round.", "It has beautiful scenery and the weather is mild all year round."),
    ],
  },
  government: {
    reasonsPos: [
      idea("giữ trật tự xã hội", "keep society safe", "Clear rules help keep everyone safe.", "Strict laws help keep society safe and orderly."),
      idea("bảo vệ người yếu thế", "protect vulnerable people", "It protects people who can't protect themselves.", "Governments have a duty to protect the most vulnerable people."),
    ],
    reasonsNeg: [
      idea("thủ tục rườm rà", "too much paperwork", "There's just too much paperwork involved.", "Too much bureaucracy slows everything down."),
      idea("phạt chưa đủ răn đe", "punishments are too light", "I feel the punishments are too light to stop people.", "Some punishments are too light to act as a real deterrent."),
    ],
    examples: [
      idea("luật đội mũ bảo hiểm", "the helmet law", "For example, the helmet law has made me feel much safer on the road.", "Vietnam's helmet law is a good example of a rule that saved many lives."),
      idea("dịch vụ công online", "online public services", "Recently I renewed a document online, which was surprisingly quick.", "For instance, many public services in Vietnam can now be done online."),
    ],
    endPos: [
      idea("cần thiết", "necessary", "So I think these rules are necessary.", "So overall, good governance benefits everyone."),
    ],
    endNeg: [
      idea("cần cải thiện", "need improving", "So I think things could be improved.", "So I believe the system needs to be more transparent."),
    ],
    describe: [
      idea("trang nghiêm, cổ kính", "grand and historic", "It's a grand, historic building that looks beautiful at night.", "It's a grand, historic building that looks beautiful at night."),
    ],
  },
  daily: {
    reasonsPos: [
      idea("giúp thư giãn", "help me relax", "It helps me relax and forget about my worries.", "Simple routines help people relax and stay balanced."),
      idea("vui và thú vị", "fun and enjoyable", "It's just a lot of fun, to be honest.", "Everyday pleasures make a big difference to people's happiness."),
      idea("có thời gian cho bản thân", "time for myself", "It gives me some time for myself.", "Everyone needs a bit of time for themselves."),
    ],
    reasonsNeg: [
      idea("không có hứng thú", "not my thing", "It's just not really my thing.", "Not everyone enjoys the same things, which is perfectly normal."),
      idea("bất tiện", "inconvenient", "It's a bit inconvenient for me at the moment.", "It can be inconvenient for people living in big cities."),
    ],
    examples: [
      idea("cuối tuần trước", "last weekend", "For example, last weekend I spent the whole afternoon doing exactly that.", "For example, in Vietnam people often spend weekends at coffee shops with friends."),
      idea("với bạn bè", "with my friends", "I usually do it with my close friends, which makes it even better.", "Many young people do this with friends rather than alone."),
    ],
    endPos: [
      idea("một phần quan trọng", "an important part of my life", "So it's an important part of my life.", "So overall, small pleasures matter more than we think."),
      idea("sẽ tiếp tục", "will keep doing it", "I'll definitely keep doing it in the future.", "I think this trend will continue in the future."),
    ],
    endNeg: [
      idea("có thể thử lại", "might give it another try", "Maybe I'll give it another try one day.", "Maybe attitudes will change in the future."),
    ],
    describe: [
      idea("nhỏ nhưng ấm cúng", "small but cosy", "It's small but really cosy, with soft lighting and quiet music.", "It's small but really cosy, with soft lighting and quiet music."),
      idea("rực rỡ, nhiều màu sắc", "bright and colourful", "It's bright and colourful, so it always puts me in a good mood.", "It's bright and colourful, so it always puts me in a good mood."),
    ],
  },
};
banks.other = banks.daily;

const flipPronouns = (text: string) => text
  .replace(/\byou are\b/gi, "I am").replace(/\byou're\b/gi, "I'm").replace(/\byou were\b/gi, "I was")
  .replace(/\byourself\b/gi, "myself").replace(/\byours\b/gi, "mine").replace(/\byour\b/gi, "my")
  .replace(/\byou\b/gi, "I").replace(/\s+/g, " ").trim();
const tidy = (text: string) => text.replace(/[?.!]+$/, "").replace(/\s+/g, " ").trim();
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Lower-cases the first letter for use mid-sentence, but never the pronoun "I". */
const low = (text: string) => /^I\b/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
const softAdverbs = /\b(often|usually|really|ever|still|much|always|normally)\b\s*/gi;

/** Two or three ways to answer the question itself: yes/no echoes, a choice between options, or a frame to complete. */
function firstAnswers(question: string, part: 1 | 3): BuilderOption[] {
  const q = tidy(question.split("\n")[0]);
  // "Are you a student or do you work now?" — two clauses joined by "or".
  const clauses = q.match(/^(.*?),?\s+or\s+((?:do|are|did|have|would)\s+you\s+.*)$/i);
  if (clauses) {
    const say = (clause: string) => cap(flipPronouns(clause.replace(/^(do|did)\s+you\s+/i, "I ").replace(/^are\s+you\s+/i, "I'm ").replace(/^have\s+you\s+/i, "I have ").replace(/^would\s+you\s+/i, "I'd ")));
    const a = say(clauses[1]), b = say(clauses[2]);
    return [
      { vi: "Lựa chọn thứ nhất", en: a.toLowerCase(), sentence: `${a}.`, tone: "pos" },
      { vi: "Lựa chọn thứ hai", en: b.toLowerCase(), sentence: `${b}.`, tone: "pos" },
      { vi: "Cả hai", en: "a bit of both", sentence: `Actually, a bit of both — ${low(a)}, and ${low(b)} as well.`, tone: "mix" },
    ];
  }
  // "Do you prefer to study in the mornings or in the afternoons?" — pick one side.
  const choice = q.match(/^(?:do|would)\s+you\s+(.+?)\s+or\s+(.+)$/i);
  if (choice) {
    const left = flipPronouns(choice[1]);
    const right = flipPronouns(choice[2]);
    const lead = right.split(" ")[0].toLowerCase();
    const cut = left.toLowerCase().lastIndexOf(` ${lead} `);
    // "prefer to study in the mornings" + "in the afternoons" share "in"; otherwise keep just the verb ("like tea" / "coffee").
    const base = cut > 0 ? left.slice(0, cut + 1) : `${left.split(" ")[0]} `;
    const optionB = `${base}${right}`;
    const verb = /^prefer\b|^like\b|^enjoy\b/i.test(left) ? "" : "I'd rather ";
    return [
      { vi: "Chọn vế đầu", en: tidy(left), sentence: `${verb ? verb : "I "}${left}, definitely.`, tone: "pos" },
      { vi: "Chọn vế sau", en: tidy(optionB), sentence: `${verb ? verb : "I "}${optionB}, to be honest.`, tone: "pos" },
      { vi: "Tùy lúc", en: "it depends", sentence: "It really depends on the situation, but I'd say I go for both from time to time.", tone: "mix" },
    ];
  }
  // Yes/no opinion questions (all of Part 3's, and Part 1's "Should…/Is it…") take a stance; Part 3 wh-questions use a frame below.
  if (/^(do you think|should|is|are|will|can|could|would|has|have|does|do)\b/i.test(q) && (part === 3 || /^(do you think|should|is it|are there|is there|will|can|could)\b/i.test(q))) {
    const statement = flipPronouns(q.replace(/^do you think\s+(that\s+)?/i, "").replace(/^(should|will|can|could|would)\s+(.+?)\s+(\w+)/i, (_, aux: string, who: string, verb: string) => `${who} ${aux.toLowerCase()} ${verb}`).replace(/^(is|are)\s+(it|there|\w+)\s+/i, (_, aux: string, who: string) => `${who} ${aux.toLowerCase()} `).replace(/^(?:do|does)\s+/i, "").replace(/^(has|have)\s+(\w+)\s+/i, (_, aux: string, who: string) => `${who} ${aux.toLowerCase()} `));
    return [
      { vi: "Đồng ý", en: "I agree", sentence: `Yes, I'd definitely say that ${low(statement)}.`, tone: "pos" },
      { vi: "Tùy trường hợp", en: "it depends", sentence: "Well, it depends, but on the whole I think so.", tone: "mix" },
      { vi: "Không đồng ý", en: "I disagree", sentence: "Actually, I don't really think so.", tone: "neg" },
    ];
  }
  const doYou = q.match(/^(do|does)\s+you\s+(.+)$/i);
  if (doYou) {
    const vp = flipPronouns(doYou[2]);
    return [
      { vi: "Có", en: `yes, I ${tidy(vp)}`, sentence: /^(like|love|enjoy)\b/i.test(vp) ? `Yes, I do. I really ${vp}.` : `Yes, I do — I ${vp}.`, tone: "pos" },
      { vi: "Tùy lúc", en: "it depends", sentence: "Well, it depends, really — more on some days than others.", tone: "mix" },
      { vi: "Không hẳn", en: "not really", sentence: `Not really, to be honest. I don't ${vp.replace(softAdverbs, "")} that much.`, tone: "neg" },
    ];
  }
  const areYou = q.match(/^(are)\s+you\s+(.+)$/i);
  if (areYou) {
    const rest = flipPronouns(areYou[2]);
    return [
      { vi: "Có", en: `yes, I'm ${rest}`, sentence: `Yes, I'd say I'm ${rest}.`, tone: "pos" },
      { vi: "Cũng tạm", en: "kind of", sentence: `I'm ${rest} to some extent, I suppose.`, tone: "mix" },
      { vi: "Không hẳn", en: "not really", sentence: `Not really, I wouldn't say I'm ${rest}.`, tone: "neg" },
    ];
  }
  if (/^(did|have|has|had|was|were|can|could|would|will)\b/i.test(q)) return [
    { vi: "Có", en: "yes", sentence: /^did/i.test(q) ? "Yes, I did, actually." : /^(have|has)/i.test(q) ? "Yes, I have, quite a few times actually." : "Yes, definitely.", tone: "pos" },
    { vi: "Một chút", en: "a little", sentence: "A little bit, I suppose.", tone: "mix" },
    { vi: "Không", en: "no", sentence: /^did/i.test(q) ? "No, I didn't, to be honest." : /^(have|has)/i.test(q) ? "No, I haven't, actually." : "Not really, to be honest.", tone: "neg" },
  ];
  // Wh-questions: the learner supplies the key word, the frame turns it into a sentence.
  const frame = /^why\b/i.test(q) ? "The main reason is that ___." : /^(how often|when|what time)\b/i.test(q) ? "I'd say ___, more or less." : /^where\b/i.test(q) ? "That would be ___." : /^who\b/i.test(q) ? "It would have to be ___." : /^how\b/i.test(q) ? "Well, I'd say ___." : "Well, the first thing that comes to mind is ___.";
  return [
    { vi: "Trả lời bằng ý của bạn", en: frame.replace(/\.$/, ""), sentence: frame, tone: "pos", blank: "Ý chính (tiếng Anh, vd: my hometown, twice a week)" },
    { vi: "Mở đầu tự nhiên", en: "that's an interesting question", sentence: `That's an interesting question. ${frame}`, tone: "pos", blank: "Ý chính (tiếng Anh)" },
  ];
}

/** What a cue card asks about, so the general description fits a person, a place, an event, a thing or an activity. */
function cueKind(text: string): "person" | "place" | "event" | "thing" | "activity" {
  const t = text.toLowerCase();
  if (/\b(person|someone|somebody|friend|teacher|family member|relative|neighbou?r|child|man|woman|people|singer|actor|leader)\b/.test(t)) return "person";
  if (/\b(time|event|occasion|exam|test|trip|journey|experience|day|party|festival|celebration|wedding|holiday|change|decision|situation|mistake|plan)\b/.test(t)) return "event";
  if (/\b(hobby|sport|activity|skill|habit|game|job|work|course|subject)\b/.test(t)) return "activity";
  if (/\b(place|building|city|town|park|restaurant|shop|house|home|country|area|street|market|room|school|café|cafe|museum|library|river|lake|beach|mountain)\b/.test(t)) return "place";
  return "thing";
}
const describeByKind: Record<ReturnType<typeof cueKind>, BuilderOption[]> = {
  person: [
    { vi: "thân thiện, dễ gần", en: "friendly and easy-going", sentence: "This person is really friendly and easy-going, so everyone feels comfortable around them." },
    { vi: "chăm chỉ, đáng ngưỡng mộ", en: "hard-working and inspiring", sentence: "What I admire most is how hard-working and inspiring they are." },
  ],
  place: [], // filled from the topic bank, whose descriptions are of places
  event: [
    { vi: "đáng nhớ, nhiều cảm xúc", en: "memorable and emotional", sentence: "It was a really memorable experience, full of mixed emotions." },
    { vi: "thử thách nhưng bổ ích", en: "challenging but worthwhile", sentence: "It was quite challenging at first, but it turned out to be really worthwhile." },
  ],
  thing: [
    { vi: "đơn giản nhưng hữu ích", en: "simple but useful", sentence: "It's quite simple, but it's incredibly useful in my daily life." },
    { vi: "có ý nghĩa đặc biệt", en: "special meaning", sentence: "It may not look special, but it has a lot of meaning for me." },
  ],
  activity: [
    { vi: "vui và giúp thư giãn", en: "fun and relaxing", sentence: "It's both fun and relaxing, and it doesn't cost much at all." },
    { vi: "cần kiên nhẫn", en: "takes patience", sentence: "It takes a lot of patience, but that's exactly what I like about it." },
  ],
};
const describeFor = (kind: ReturnType<typeof cueKind>, bank: Bank): BuilderOption[] => kind === "place" ? bank.describe.map((item) => ({ vi: item.vi, en: item.en, sentence: item.me, tone: "pos" as const })) : describeByKind[kind];

const pick = (ideas: Idea[], scope: "me" | "all", tone: Tone = "pos"): BuilderOption[] => ideas.map((item) => ({ vi: item.vi, en: item.en, sentence: scope === "me" ? item.me : item.all, tone }));
const reasonsFor = (bank: Bank, tone: Tone, scope: "me" | "all") => tone === "neg" ? pick(bank.reasonsNeg, scope, "neg") : tone === "mix" ? [...pick(bank.reasonsPos.slice(0, 2), scope), ...pick(bank.reasonsNeg.slice(0, 1), scope, "neg")] : pick(bank.reasonsPos, scope);
const endingsFor = (bank: Bank, tone: Tone, scope: "me" | "all") => tone === "neg" ? [...pick(bank.endNeg, scope, "neg"), ...pick(bank.endPos.slice(0, 1), scope)] : [...pick(bank.endPos, scope), ...pick(bank.endNeg, scope, "neg")];

/** The steps of the builder for one question, given the stance chosen at the first step. */
export function builderSteps(item: SpeakingItem, topic: string, tone: Tone = "pos"): BuilderStep[] {
  const bank = banks[topic] ?? banks.daily;
  if (item.kind === "cue") {
    const subject = flipPronouns(item.text.replace(/^describe\s+/i, "").replace(/\s*\(.*?\)\s*/g, " ")).replace(/[.?]$/, "");
    return [
      { id: "open", label: "Mở bài", hint: "Giới thiệu ngay bạn sẽ nói về điều gì.", options: [
        { vi: "Nói thẳng chủ đề", en: `I'd like to talk about ${subject}`, sentence: `I'd like to talk about ${subject}.` },
        { vi: "Mở đầu tự nhiên", en: "the first thing that comes to mind", sentence: `When I think about ${subject}, the first thing that comes to mind is ___.`, blank: "Tên cụ thể (vd: Hanoi Book Street)" },
      ] },
      { id: "context", label: "Bối cảnh", hint: "Cho biết khi nào, ở đâu hoặc bạn biết đến nó thế nào.", options: [
        { vi: "Cách đây vài năm", en: "a few years ago", sentence: "I first came across it a few years ago, when I was still at secondary school." },
        { vi: "Gần đây thôi", en: "quite recently", sentence: "It was actually quite recently — just a couple of months ago." },
        { vi: "Từ hồi nhỏ", en: "since I was a child", sentence: "It has been part of my life since I was a child." },
      ] },
      { id: "general", label: "Tả chung", hint: "Miêu tả tổng quan: trông thế nào, có gì đặc biệt.", options: describeFor(cueKind(item.text), bank).concat([{ vi: "Tả bằng ý của bạn", en: "what stands out is", sentence: "What really stands out about it is ___.", blank: "Đặc điểm nổi bật (tiếng Anh)", tone: "pos" }]) },
      { id: "detail", label: "Tả sát đề", hint: "Trả lời từng gợi ý trên cue card, chọn ý bạn muốn nói kỹ nhất.", options: (item.bullets?.length ? item.bullets : ["why it matters to you"]).slice(0, 4).map((bullet, index) => {
        const point = flipPronouns(bullet.replace(/^and\s+(explain\s+)?/i, ""));
        return { vi: `Nói kỹ gợi ý ${index + 1}`, en: point, sentence: `As for ${low(point)}, ___.`, blank: "Câu trả lời cho ý này (tiếng Anh)" };
      }) },
      { id: "close", label: "Chốt lại", hint: "Kết bằng cảm nghĩ của bạn.", options: [
        { vi: "Rất ý nghĩa với tôi", en: "it means a lot to me", sentence: "All in all, it means a lot to me, and I'll always remember it." },
        ...pick(bank.endPos.slice(0, 1), "me"),
      ] },
    ];
  }
  const scope = item.part === 3 ? "all" : "me";
  return [
    { id: "answer", label: item.part === 3 ? "Quan điểm" : "Trả lời", hint: item.part === 3 ? "Nêu rõ bạn đồng ý, không đồng ý hay tùy trường hợp." : "Trả lời thẳng vào câu hỏi trước tiên.", options: firstAnswers(item.text, item.part === 3 ? 3 : 1) },
    { id: "reason", label: "Lý do", hint: tone === "neg" ? "Vì sao bạn trả lời như vậy? Chọn lý do chính." : "Chọn lý do chính cho câu trả lời của bạn.", options: reasonsFor(bank, tone, scope) },
    { id: "example", label: "Ví dụ", hint: "Thêm một ví dụ cụ thể để câu trả lời thuyết phục hơn.", options: pick(bank.examples, scope) },
    { id: "close", label: "Kết luận", hint: "Chốt lại bằng cảm nghĩ hoặc kết quả.", options: endingsFor(bank, tone, scope) },
  ];
}

/** A picked option as the sentence it adds, with the learner's own words in the blank. */
export function filled(option: BuilderOption, words = "") {
  return option.blank ? option.sentence.replace("___", words.trim() || "…") : option.sentence;
}
