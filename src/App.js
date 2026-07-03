import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
const SB_URL  = "https://fxaqbbzkuyfildqoxlfh.supabase.co";
const SB_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFiYnprdXlmaWxkcW94bGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTg3OTIsImV4cCI6MjA5NzI3NDc5Mn0.7IMYYWdNwQJIPw52ShJNNqsmqR208Xn3GN4uIxa-9do";
const H = { "Content-Type":"application/json", apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}` };

// ─── PUSH NOTIFICATIONS (Web Push via Supabase Edge Function) ───────────────
const VAPID_PUBLIC_KEY = "BMG55DgvK7kxEaB-NROSkJH6nVeSt8NiLqS7NB899WsLKPi8iymFIJu3KoMrEmYV5YBluo9YM6cbs5uCWTGRJ2I";

async function registerPush(memberId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:key });
    }
    const subStr = JSON.stringify(sub);
    // Delete existing subscription for this member then insert fresh (upsert pattern)
    await fetch(`${SB_URL}/rest/v1/push_subscriptions?member_id=eq.${memberId}`, {
      method:"DELETE", headers:{ ...H }
    }).catch(()=>{});
    await sbPost("push_subscriptions", [{ member_id:memberId, subscription:subStr }]).catch(()=>{});
    return sub;
  } catch(e) { console.warn("Push registration failed:", e.message); return null; }
}

async function sendPushNotification(familyId, title, body, excludeMemberId=null) {
  try {
    await fetch(`${SB_URL}/functions/v1/push-notify`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${SB_KEY}`, "apikey":SB_KEY },
      body: JSON.stringify({ familyId, title, body, excludeMemberId })
    });
  } catch(e) { console.warn("Push send failed:", e.message); }
}

async function sb(path, opts={}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers:{...H,...(opts.headers||{})}, ...opts });
  const txt = await res.text();
  if (!res.ok) { const e=JSON.parse(txt||"{}"); throw new Error(e.message||e.hint||`HTTP ${res.status}`); }
  return txt ? JSON.parse(txt) : null;
}
const sbGet  = (t,q="")   => sb(`${t}?${q}&apikey=${SB_KEY}`, { headers:{...H,"Accept":"application/json"} });
const sbPost = (t,body)   => sb(t, { method:"POST", body:JSON.stringify(body), headers:{...H,"Prefer":"return=representation"} });
const sbPatch= (t,q,body) => sb(`${t}?${q}`, { method:"PATCH", body:JSON.stringify(body), headers:{...H,"Prefer":"return=representation"} });
const sbDel  = (t,q)      => sb(`${t}?${q}`, { method:"DELETE", headers:H });

// ─── SUPABASE AUTH (email-based) ─────────────────────────────────────────────
async function sbSignUp(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method:"POST", headers:H,
    body:JSON.stringify({ email, password })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Signup failed");
  return d;
}
async function sbSignIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:"POST", headers:H,
    body:JSON.stringify({ email, password })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Invalid email or password");
  return d;
}
async function sbSignOut(token) {
  await fetch(`${SB_URL}/auth/v1/logout`, {
    method:"POST", headers:{...H, Authorization:`Bearer ${token}`}
  });
}
async function sbSendResetEmail(email) {
  // Sends a password reset link to the user's email
  const res = await fetch(`${SB_URL}/auth/v1/recover`, {
    method:"POST", headers:H,
    body:JSON.stringify({ email })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Email not found. Please check and try again.");
  return d;
}
async function sbVerifyOTP(email, otp) {
  const res = await fetch(`${SB_URL}/auth/v1/verify`, {
    method:"POST", headers:H,
    body:JSON.stringify({ type:"recovery", email, token:otp })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Invalid or expired code. Please request a new one.");
  return d;
}
async function sbUpdatePassword(accessToken, newPassword) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    method:"PUT", headers:{...H, Authorization:`Bearer ${accessToken}`},
    body:JSON.stringify({ password: newPassword })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.msg||d.error_description||"Failed to update password");
  return d;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// ─── TRANSLATIONS ────────────────────────────────────────────────────────────
const T = {
  en: {
    // App
    appName: "Family Kitchen",
    appTagline: "Plan meals together, eat happily",
    brandedBy: "✅ Live — Designed by Revive Healthcare",
    // Auth
    signIn: "Sign In", register: "Register", createAccount: "Create Account",
    email: "Email Address", password: "Password", confirmPassword: "Confirm Password",
    username: "Username", usernameSub: "(visible to family members)",
    forgotPassword: "Forgot password?", sendResetLink: "📧 Send Reset Link",
    invitedLink: "Invited by a family member?", getJoiningLink: "Get joining link",
    pleaseWait: "Please wait...",
    // Family setup
    setUpFamily: "Set Up Your Family", createFamily: "🏠 Create My Family",
    joinFamily: "🔗 Join Family", createFamilyLabel: "Create Family",
    joinFamilyLabel: "Join Family", startNewGroup: "Start a new group",
    useExistingId: "Use an existing Family ID",
    familyName: "Family Name", familyPassword: "Family Password",
    familyPasswordSub: "(share with members)", familyId: "Family ID",
    askKitchenHead: "Ask your Kitchen Head",
    // Nav
    dashboard: "Dashboard", foodDatabase: "Food Database",
    shopping: "Shopping", family: "Family", finalizeMenu: "Finalize Menu",
    // Dashboard
    weeklyMealPlanner: "Weekly Meal Planner", selectionsThisWeek: "selections this week",
    finalized: "finalized", viewAll: "View →", today: t.today, tomorrow: t.tomorrow,
    items: "items", clickToAdd: "Tap to add meals",
    // Meals
    breakfast: "Breakfast", lunch: "Lunch", eveningSnack: "Evening Snack", dinner: "Dinner",
    // Meal view
    currentSelections: t.currentSelections, searchItems: "Search items or ingredients…",
    favourites: "Favourites", allItems: "All Items",
    addTo: "Add to", info: "Info", addBtn: "+ Add",
    timesThisWeek: "time(s) this week",
    // Food DB
    foodDatabaseTitle: "Food Database", itemsTotal: "items total",
    addNewItem: t.addNewItem, csvImport: t.csvImport, aiImport: t.aiImport,
    searchFoodItems: "Search food items...", editBtn: "Edit", delBtn: "Del",
    saveToDatabase: t.saveToDatabase, saving: t.saving,
    cancel: "Cancel", addNewFoodItem: "Add New Food Item", editFoodItem: "Edit Food Item",
    foodPhoto: "Food Photo", optional: "optional", max2mb: "max 2MB",
    changePhoto: "Change Photo", uploadPhoto: "Upload Photo", removePhoto: "Remove",
    foodName: "Food Name", foodNameHi: "Food Name in Hindi (optional)",
    emoji: "Emoji", portionSize: "Portion Size", calories: "Calories (kcal)",
    protein: "Protein (g)", carbs: "Carbs (g)", fat: "Fat (g)", fiber: "Fiber (g)",
    categories: "Categories", selectAll: "(select all that apply)",
    atLeastOne: "Select at least one category",
    youtubeUrl: "YouTube URL", ingredients: "Ingredients",
    onePerLine: "(one per line)", recipeInstructions: "Recipe Instructions",
    // Shopping
    shoppingList: "Shopping List", itemsRemaining: "items remaining",
    haveItems: "have", addItem: "+ Add", refresh: "↻ Refresh",
    listTab: t.listTab, orderOnlineTab: t.orderOnlineTab,
    shareOrSave: t.shareOrSave, print: t.print,
    noShoppingList: "No shopping list yet",
    noShoppingListSub: "The Kitchen Head must finalize the menu first",
    orderViaDelivery: "Choose a delivery app. You'll see all items with a search button against each one.",
    itemsTo: "items", searchOn: "🔍 Search",
    addedToCart: "✓ Added to Cart", skip: "Skip →", allDone: "🎉 All done!",
    allDoneSub: "All items have been added to your",
    // Finalize
    finalizeTitle: "Finalize Menu",
    finalizeSub: "Approve items for the week — only approved items go to the shopping list",
    printMenu: t.printMenu, approved: "Approved", approve: t.approve,
    itemsApproved: "items approved", generateShoppingList: "🛒 Generate Shopping List →",
    noMealsPlanned: "No meals planned yet",
    // Family
    familyMembers: "Family Members", inviteMember: "Invite Family Member",
    inviteSub: "Enter their name and email. They register with that email to auto-join.",
    name: "Name", emailAddress: "Email Address", sendInvite: "📧 Send Invite",
    sending: "Sending...", adding: "Adding...",
    makeHead: t.makeHead, remove: "Remove", shareInvite: "📤 Send Link", whatsapp: t.whatsapp,
    invitePending: t.invitePending, kitchenHead: "★ Head",
    howPendingJoin: "📋 How pending members join:",
    pendingStep1: "Tap 📤 Send Link on their card below",
    pendingStep2: "Send them the message via WhatsApp",
    pendingStep3: "They open the app link → tap Register",
    pendingStep4: "They register using the same email → auto-joined! ✅",
    familyIdAndPassword: t.familyIdAndPassword,
    shareThisId: "Share this Family ID + family password with new members.",
    resetFamilyPassword: t.resetFamilyPassword,
    newFamilyPassword: "New Family Password", confirmFamilyPassword: "Confirm Password",
    updatePassword: t.updatePassword, updating: t.updating,
    signOut: "Sign Out",
    // AI Import
    aiTitle: "AI Recipe Generator",
    aiSub: "Type dish names one per line. Claude will generate full recipes and nutrition for all.",
    generateRecipes: "✨ Generate Recipes", generating: "Generating recipes... (15-20 sec)",
    saveAll: "💾 Save All", previewOf: "recipes", reviewSub: "Remove any you don't want then save all",
    // Portions & Nutrition
    portion: "Portion", kcal: "kcal", proteinLabel: "protein", carbsLabel: "carbs",
    fatLabel: "fat", fiberLabel: "fiber",
    // Language
    language: "Language",
  },
  hi: {
    // App
    appName: "फैमिली किचन",
    appTagline: "मिलकर खाना बनाएं, खुशी से खाएं",
    brandedBy: "✅ लाइव — Revive Healthcare द्वारा डिज़ाइन",
    // Auth
    signIn: "साइन इन", register: "रजिस्टर", createAccount: "अकाउंट बनाएं",
    email: "ईमेल पता", password: "पासवर्ड", confirmPassword: "पासवर्ड की पुष्टि करें",
    username: "उपयोगकर्ता नाम", usernameSub: "(परिवार के सदस्यों को दिखाई देगा)",
    forgotPassword: "पासवर्ड भूल गए?", sendResetLink: "📧 रीसेट लिंक भेजें",
    invitedLink: "किसी परिवार के सदस्य ने आमंत्रित किया?", getJoiningLink: "जॉइनिंग लिंक पाएं",
    pleaseWait: "कृपया प्रतीक्षा करें...",
    // Family setup
    setUpFamily: "अपना परिवार सेट करें", createFamily: "🏠 परिवार बनाएं",
    joinFamily: "🔗 परिवार जॉइन करें", createFamilyLabel: "परिवार बनाएं",
    joinFamilyLabel: "परिवार जॉइन करें", startNewGroup: "नया परिवार ग्रुप शुरू करें",
    useExistingId: "मौजूदा Family ID उपयोग करें",
    familyName: "परिवार का नाम", familyPassword: "परिवार का पासवर्ड",
    familyPasswordSub: "(सदस्यों के साथ साझा करें)", familyId: "Family ID",
    askKitchenHead: "किचन हेड से पूछें",
    // Nav
    dashboard: "डैशबोर्ड", foodDatabase: "खाने का डेटाबेस",
    shopping: "खरीदारी", family: "परिवार", finalizeMenu: "मेनू फाइनल करें",
    // Dashboard
    weeklyMealPlanner: "साप्ताहिक भोजन योजना", selectionsThisWeek: "इस सप्ताह चयन",
    finalized: "फाइनल", viewAll: "देखें →", today: "आज", tomorrow: "कल",
    items: "आइटम", clickToAdd: "भोजन जोड़ने के लिए टैप करें",
    // Meals
    breakfast: "नाश्ता", lunch: "दोपहर का खाना", eveningSnack: "शाम का नाश्ता", dinner: "रात का खाना",
    // Meal view
    currentSelections: "📋 वर्तमान चयन", searchItems: "आइटम या सामग्री खोजें…",
    favourites: "पसंदीदा", allItems: "सभी आइटम",
    addTo: "जोड़ें", info: "जानकारी", addBtn: "+ जोड़ें",
    timesThisWeek: "बार इस सप्ताह",
    // Food DB
    foodDatabaseTitle: "खाने का डेटाबेस", itemsTotal: "आइटम कुल",
    addNewItem: "+ नया आइटम", csvImport: "CSV आयात", aiImport: "AI आयात",
    searchFoodItems: "खाने की चीज़ें खोजें...", editBtn: "संपादित", delBtn: "हटाएं",
    saveToDatabase: "💾 डेटाबेस में सहेजें", saving: "सहेज रहे हैं...",
    cancel: "रद्द करें", addNewFoodItem: "नया खाना जोड़ें", editFoodItem: "खाना संपादित करें",
    foodPhoto: "खाने की फोटो", optional: "वैकल्पिक", max2mb: "अधिकतम 2MB",
    changePhoto: "फोटो बदलें", uploadPhoto: "फोटो अपलोड करें", removePhoto: "हटाएं",
    foodName: "खाने का नाम (अंग्रेज़ी)", foodNameHi: "खाने का नाम (हिंदी)",
    emoji: "इमोजी", portionSize: "मात्रा", calories: "कैलोरी (kcal)",
    protein: "प्रोटीन (g)", carbs: "कार्बोहाइड्रेट (g)", fat: "वसा (g)", fiber: "फाइबर (g)",
    categories: "श्रेणियाँ", selectAll: "(सभी लागू विकल्प चुनें)",
    atLeastOne: "कम से कम एक श्रेणी चुनें",
    youtubeUrl: "YouTube लिंक", ingredients: "सामग्री",
    onePerLine: "(प्रत्येक एक लाइन में)", recipeInstructions: "बनाने की विधि",
    // Shopping
    shoppingList: "खरीदारी सूची", itemsRemaining: "आइटम शेष",
    haveItems: "पास में हैं", addItem: "+ जोड़ें", refresh: "↻ रीफ्रेश",
    listTab: "📋 सूची", orderOnlineTab: "🛒 ऑनलाइन ऑर्डर",
    shareOrSave: "📤 शेयर / सहेजें", print: "🖨️ प्रिंट",
    noShoppingList: "अभी कोई खरीदारी सूची नहीं",
    noShoppingListSub: "किचन हेड को पहले मेनू फाइनल करना होगा",
    orderViaDelivery: "डिलीवरी ऐप चुनें। हर आइटम के सामने सर्च बटन दिखेगा।",
    itemsTo: "आइटम", searchOn: "🔍 खोजें",
    addedToCart: "✓ कार्ट में जोड़ा", skip: "छोड़ें →", allDone: "🎉 हो गया!",
    allDoneSub: "सभी आइटम आपके",
    // Finalize
    finalizeTitle: "मेनू फाइनल करें",
    finalizeSub: "सप्ताह के लिए आइटम स्वीकृत करें — केवल स्वीकृत आइटम खरीदारी सूची में जाएंगे",
    printMenu: "🖨️ मेनू प्रिंट करें", approved: "स्वीकृत", approve: "स्वीकृत करें",
    itemsApproved: "आइटम स्वीकृत", generateShoppingList: "🛒 खरीदारी सूची बनाएं →",
    noMealsPlanned: "अभी कोई भोजन नियोजित नहीं",
    // Family
    familyMembers: "परिवार के सदस्य", inviteMember: "परिवार के सदस्य को आमंत्रित करें",
    inviteSub: "उनका नाम और ईमेल दर्ज करें। वे उसी ईमेल से रजिस्टर करके ऑटो-जॉइन होंगे।",
    name: "नाम", emailAddress: "ईमेल पता", sendInvite: "📧 आमंत्रण भेजें",
    sending: "भेज रहे हैं...", adding: "जोड़ रहे हैं...",
    makeHead: "हेड बनाएं", remove: "हटाएं", shareInvite: "📤 लिंक भेजें", whatsapp: t.whatsapp,
    invitePending: "⏳ आमंत्रण लंबित", kitchenHead: "★ किचन हेड",
    howPendingJoin: "📋 लंबित सदस्य कैसे जॉइन करें:",
    pendingStep1: "नीचे उनके कार्ड पर 📤 लिंक भेजें टैप करें",
    pendingStep2: "WhatsApp पर संदेश भेजें",
    pendingStep3: "वे ऐप लिंक खोलें → रजिस्टर टैप करें",
    pendingStep4: "वे उसी ईमेल से रजिस्टर करें → ऑटो-जॉइन! ✅",
    familyIdAndPassword: "🔗 Family ID और पासवर्ड",
    shareThisId: "यह Family ID और पासवर्ड नए सदस्यों के साथ साझा करें।",
    resetFamilyPassword: "🔑 परिवार का पासवर्ड बदलें",
    newFamilyPassword: "नया परिवार पासवर्ड", confirmFamilyPassword: "पासवर्ड की पुष्टि करें",
    updatePassword: "पासवर्ड अपडेट करें", updating: "अपडेट हो रहा है...",
    signOut: "साइन आउट",
    // AI Import
    aiTitle: "AI रेसिपी जेनरेटर",
    aiSub: "प्रत्येक लाइन पर व्यंजन का नाम लिखें। Claude सभी के लिए पूरी रेसिपी बनाएगा।",
    generateRecipes: "✨ रेसिपी बनाएं", generating: "रेसिपी बन रही हैं... (15-20 सेकंड)",
    saveAll: "💾 सभी सहेजें", previewOf: "रेसिपी", reviewSub: "जो नहीं चाहिए हटाएं, फिर सभी सहेजें",
    // Portions & Nutrition
    portion: "मात्रा", kcal: "kcal", proteinLabel: "प्रोटीन", carbsLabel: "कार्ब्स",
    fatLabel: "वसा", fiberLabel: "फाइबर",
    // Language
    language: "भाषा",
  }
};

// Language context — read/write from localStorage
const getLang  = () => localStorage.getItem("fk_lang") || "en";
const setLang  = (l) => localStorage.setItem("fk_lang", l);
const LangCtx  = React.createContext("en");
const useLang  = () => React.useContext(LangCtx);
const useT     = () => T[React.useContext(LangCtx)] || T.en;

// Language toggle button component
function LangToggle({ lang, onChange, style={} }) {
  return (
    <button
      onClick={() => onChange(lang === "en" ? "hi" : "en")}
      style={{ background:"none", border:"1px solid currentColor", borderRadius:20, padding:"4px 12px", cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6, ...style }}>
      🌐 {lang === "en" ? "हिंदी" : "English"}
    </button>
  );
}

const DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const MEALS = ["Breakfast","Lunch","Evening Snack","Dinner"];
const MICONS= { Breakfast:"🌅", Lunch:"☀️", "Evening Snack":"🍵", Dinner:"🌙" };
const MCOLS = ["#F4A200","#2D6A4F","#C1440E","#6B5CE7","#E91E8C","#00BCD4","#FF5722","#009688"];
const SAPPS = [
  { name:"Blinkit",   url:"https://blinkit.com/s/?q=",                        color:"#F5C518", logo:"⚡" },
  { name:"Zepto",     url:"https://www.zeptonow.com/search?query=",            color:"#9B59B6", logo:"🟣" },
  { name:"Instamart", url:"https://www.swiggy.com/instamart/search?query=",    color:"#FC8019", logo:"🛒" },
  { name:"BigBasket", url:"https://www.bigbasket.com/ps/?q=",                  color:"#84C225", logo:"🛍️" },
  { name:"Amazon Now",url:"https://www.amazon.in/s?k=",                        color:"#FF9900", logo:"📦" },
];

// ─── SEED DATA (inserted once on first load) ─────────────────────────────────
const SEED_FOODS = [
  { name:"Poha", category:"Breakfast", emoji:"🍚", calories:250, protein:6, carbs:45, fat:5, fiber:3, portion:"1 bowl (150g)", ingredients:["Flattened rice 1 cup","Onion 1 medium","Potato 1 small","Green chili 2","Mustard seeds 1 tsp","Turmeric ½ tsp","Curry leaves 8-10","Oil 1 tbsp","Lemon juice 1 tsp","Coriander to garnish"], recipe:"Heat oil, add mustard seeds and let them splutter. Add curry leaves, green chili, and onion. Sauté till golden. Add diced potato and cook 5 min. Add soaked poha, turmeric, salt. Mix well on low flame 3 min. Garnish with lemon juice and coriander.", youtube:"https://www.youtube.com/results?search_query=poha+recipe" },
  { name:"Paratha with Curd", category:"Breakfast", emoji:"🫓", calories:380, protein:10, carbs:55, fat:14, fiber:4, portion:"2 parathas + 100g curd", ingredients:["Whole wheat flour 1 cup","Water as needed","Salt to taste","Ghee 1 tbsp","Fresh curd 100g"], recipe:"Knead soft dough with flour, water and salt. Make balls, roll into circles, cook on tawa with ghee till golden spots appear on both sides. Serve hot with fresh curd.", youtube:"https://www.youtube.com/results?search_query=paratha+recipe" },
  { name:"Idli Sambar", category:"Breakfast", emoji:"🍢", calories:300, protein:9, carbs:55, fat:4, fiber:5, portion:"3 idlis + 1 cup sambar", ingredients:["Idli batter 3 cups","Toor dal 1 cup","Mixed vegetables","Sambar powder 2 tsp","Tamarind paste 1 tsp","Mustard seeds","Curry leaves"], recipe:"Steam idli batter in greased moulds 10-12 min. For sambar: cook dal with veggies, add tamarind, sambar powder. Temper with mustard seeds and curry leaves.", youtube:"https://www.youtube.com/results?search_query=idli+sambar+recipe" },
  { name:"Upma", category:"Breakfast", emoji:"🥣", calories:220, protein:7, carbs:40, fat:6, fiber:3, portion:"1 bowl (180g)", ingredients:["Semolina 1 cup","Onion 1","Green chili 2","Mustard seeds 1 tsp","Urad dal 1 tsp","Curry leaves","Cashews 8-10","Water 2.5 cups","Oil 2 tbsp","Salt to taste"], recipe:"Dry roast semolina till aromatic. Heat oil, temper with mustard, urad dal, cashews. Add onion, chili, curry leaves. Sauté. Add water and salt, bring to boil. Add semolina stirring continuously. Cover and cook 3 min.", youtube:"https://www.youtube.com/results?search_query=upma+recipe" },
  { name:"Dal Tadka Rice", category:"Lunch", emoji:"🍛", calories:420, protein:18, carbs:70, fat:8, fiber:8, portion:"1 plate (250g)", ingredients:["Yellow dal 1 cup","Basmati rice 1 cup","Onion 1","Tomato 2","Garlic 4 cloves","Cumin seeds 1 tsp","Turmeric ½ tsp","Red chili powder 1 tsp","Ghee 2 tbsp","Coriander"], recipe:"Cook dal with turmeric till soft. For tadka: heat ghee, add cumin, garlic, onion-tomato masala. Pour over dal. Cook rice separately. Serve together.", youtube:"https://www.youtube.com/results?search_query=dal+tadka+rice+recipe" },
  { name:"Rajma Chawal", category:"Lunch", emoji:"🫘", calories:450, protein:20, carbs:75, fat:7, fiber:12, portion:"1 bowl rajma + 1 cup rice", ingredients:["Kidney beans 1 cup soaked","Basmati rice 1 cup","Onion 2 large","Tomato 3","Ginger-garlic paste 2 tsp","Rajma masala 2 tsp","Oil 2 tbsp"], recipe:"Pressure cook soaked rajma 4-5 whistles. Make onion-tomato gravy with spices. Add cooked rajma and simmer 15 min. Serve over steamed rice.", youtube:"https://www.youtube.com/results?search_query=rajma+chawal+recipe" },
  { name:"Paneer Butter Masala", category:"Lunch", emoji:"🧀", calories:380, protein:22, carbs:18, fat:26, fiber:3, portion:"1 bowl (200g) + 2 rotis", ingredients:["Paneer 200g","Tomato puree 1 cup","Onion 1 large","Cashews 10","Cream 2 tbsp","Butter 2 tbsp","Kashmiri red chili 2 tsp","Garam masala 1 tsp"], recipe:"Sauté onions and cashews, blend smooth. Cook with tomato puree and spices. Add paneer cubes, cream and butter. Simmer 5 min. Garnish with cream.", youtube:"https://www.youtube.com/results?search_query=paneer+butter+masala+recipe" },
  { name:"Chole Bhature", category:"Lunch", emoji:"🍽️", calories:550, protein:18, carbs:78, fat:18, fiber:14, portion:"2 bhature + 1 bowl chole", ingredients:["Chickpeas 1 cup soaked","All purpose flour 2 cups","Curd 3 tbsp","Onion 2","Tomato 3","Chole masala 2 tbsp","Baking soda ½ tsp"], recipe:"Soak chickpeas overnight, pressure cook. Make spicy gravy. For bhature, knead dough with flour, curd, baking soda. Deep fry till puffed.", youtube:"https://www.youtube.com/results?search_query=chole+bhature+recipe" },
  { name:"Masala Chai & Biscuits", category:"Evening Snack", emoji:"☕", calories:120, protein:3, carbs:20, fat:4, fiber:0, portion:"1 cup chai + 3 biscuits", ingredients:["Milk 200ml","Water 100ml","Tea leaves 1 tsp","Sugar 2 tsp","Ginger small piece","Cardamom 2","Marie biscuits 3"], recipe:"Boil water with ginger and cardamom. Add tea leaves, milk and sugar. Simmer 3-4 min. Strain and serve with biscuits.", youtube:"https://www.youtube.com/results?search_query=masala+chai+recipe" },
  { name:"Samosa", category:"Evening Snack", emoji:"🥟", calories:250, protein:5, carbs:35, fat:11, fiber:4, portion:"2 pieces (100g)", ingredients:["All purpose flour 2 cups","Potatoes 3 medium","Peas ½ cup","Coriander seeds 1 tsp","Cumin seeds 1 tsp","Garam masala 1 tsp","Oil for frying"], recipe:"Make pastry dough. Cook filling with mashed potato, peas and spices. Shape into triangles and deep fry till golden brown.", youtube:"https://www.youtube.com/results?search_query=samosa+recipe" },
  { name:"Fruit Salad", category:"Evening Snack", emoji:"🍱", calories:150, protein:2, carbs:35, fat:1, fiber:5, portion:"1 bowl (200g)", ingredients:["Apple 1","Banana 1","Orange 1","Grapes 10","Pomegranate seeds 2 tbsp","Chaat masala ½ tsp","Lemon juice 1 tsp"], recipe:"Chop all fruits into bite-sized pieces. Mix together with chaat masala and lemon juice. Serve chilled.", youtube:"https://www.youtube.com/results?search_query=fruit+salad+recipe" },
  { name:"Pakora", category:"Evening Snack", emoji:"🍘", calories:200, protein:5, carbs:24, fat:10, fiber:2, portion:"6 pieces (120g)", ingredients:["Besan 1 cup","Onion 2","Spinach handful","Green chili 2","Ajwain ½ tsp","Red chili ½ tsp","Salt to taste","Oil for frying"], recipe:"Make thick batter with besan and spices. Dip sliced onions and spinach leaves. Deep fry on medium heat till golden and crispy.", youtube:"https://www.youtube.com/results?search_query=pakora+recipe" },
  { name:"Veg Biryani", category:"Dinner", emoji:"🍚", calories:480, protein:14, carbs:80, fat:12, fiber:8, portion:"1 plate (300g)", ingredients:["Basmati rice 2 cups","Mixed vegetables 2 cups","Onion 2 large","Biryani masala 2 tbsp","Saffron few strands","Mint leaves","Ghee 3 tbsp","Fried onions"], recipe:"Parboil rice with whole spices. Layer with cooked vegetables and masala. Top with fried onions, mint and saffron milk. Dum cook 20 min on low flame.", youtube:"https://www.youtube.com/results?search_query=veg+biryani+recipe" },
  { name:"Roti Sabzi", category:"Dinner", emoji:"🫓", calories:320, protein:10, carbs:52, fat:9, fiber:6, portion:"3 rotis + 1 bowl sabzi", ingredients:["Whole wheat flour 1.5 cups","Seasonal vegetables 2 cups","Onion 1","Tomato 1","Spices as needed","Oil 1 tbsp"], recipe:"Make soft dough and roll thin rotis. Cook on hot tawa. For sabzi: sauté vegetables with onion-tomato base and spices till tender. Serve hot.", youtube:"https://www.youtube.com/results?search_query=roti+sabzi+recipe" },
  { name:"Khichdi", category:"Dinner", emoji:"🥘", calories:350, protein:14, carbs:60, fat:7, fiber:6, portion:"1 bowl (250g)", ingredients:["Rice ½ cup","Moong dal ½ cup","Ghee 1 tbsp","Cumin seeds 1 tsp","Turmeric ½ tsp","Ginger 1 inch","Water 3 cups","Salt to taste"], recipe:"Wash and soak rice and dal together 20 min. Heat ghee, add cumin and ginger. Add soaked rice-dal mix, turmeric, salt and water. Pressure cook 3 whistles. Serve hot with ghee.", youtube:"https://www.youtube.com/results?search_query=khichdi+recipe" },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',system-ui,sans-serif;background:#FFF8F0;}
.serif{font-family:'Playfair Display',serif;}
.card{background:#fff;border-radius:14px;border:1px solid #ede5d8;padding:16px;}
.card-hover{transition:all .2s;cursor:pointer;}
.card-hover:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(244,162,0,.12);border-color:#F4A200;}
.btn{border:none;cursor:pointer;border-radius:10px;font-weight:600;font-size:14px;transition:all .18s;padding:10px 20px;}
.btn-p{background:#F4A200;color:#fff;}
.btn-p:hover{background:#e09800;}
.btn-p:disabled{background:#f5c542;cursor:not-allowed;}
.btn-g{background:#fff;color:#444;border:1px solid #ddd;}
.btn-g:hover{background:#f5f5f5;}
.btn-sm{padding:6px 12px;font-size:12px;border-radius:8px;}
.btn-danger{background:#fff;color:#C1440E;border:1px solid #ffcccc;}
.btn-danger:hover{background:#fff5f5;}
.nav-btn{background:none;border:none;cursor:pointer;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:500;color:#666;display:flex;align-items:center;gap:7px;transition:all .18s;width:100%;}
.nav-btn:hover{background:#f5ede0;color:#1A1A2E;}
.nav-btn.act{background:#F4A200;color:#fff;}
.input{width:100%;padding:9px 13px;border-radius:9px;border:1px solid #ddd;font-size:14px;outline:none;transition:border .18s;}
.input:focus{border-color:#F4A200;}
.tag{background:#f0f0f0;color:#555;padding:3px 9px;border-radius:20px;font-size:12px;display:inline-block;}
.badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;}
.chip{padding:6px 14px;border-radius:20px;border:none;font-size:13px;cursor:pointer;font-weight:500;transition:all .18s;}
.food-card{border:1px solid #ede5d8;border-radius:13px;padding:13px;background:#fff;cursor:pointer;transition:all .18s;}
.food-card:hover{border-color:#F4A200;transform:translateY(-2px);box-shadow:0 4px 14px rgba(244,162,0,.14);}
.meal-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f5f0e8;}
.meal-row:last-child{border-bottom:none;}
.spinner{width:36px;height:36px;border:3px solid #f0e8d8;border-top-color:#F4A200;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto;}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.18);animation:fadeIn .25s ease;max-width:300px;}
@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
.nut-pill{border-radius:9px;padding:9px 6px;text-align:center;}
@media(max-width:660px){
  .sidebar{display:none!important;}
  .bnav{display:flex!important;}
  .main-pad{padding:14px 14px 130px!important;}
  .grid-2{grid-template-columns:1fr!important;}
  .meal-strip{grid-template-columns:repeat(4,1fr)!important;}
}
`;

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState("login");   // login | app | resetpw
  const [authToken, setAuthToken] = useState(null);
  const [authUser, setAuthUser]   = useState(null);  // supabase auth user
  const [member, setMember]   = useState(null);      // members table row
  const [family, setFamily]   = useState(null);      // families table row
  const [members, setMembers] = useState([]);
  const [foods,   setFoods]   = useState([]);
  const [planner, setPlanner] = useState([]);        // planner_items rows
  const [favs,    setFavs]    = useState({});        // { food_id: true }
  const [usageCnt,setUsageCnt]= useState({});        // { food_name: count }
  const [view,    setView]    = useState("dashboard");
  const [selDay,      setSelDay]      = useState(null);
  const [selMeal,     setSelMeal]     = useState(null);
  const [selMealView, setSelMealView] = useState(null); // meal-across-week view
  const [toast,   setToast]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [recoveryToken,   setRecoveryToken]   = useState(null); // for password reset
  const [autoInvite,      setAutoInvite]       = useState(false); // auto-open invite popup
  const [lang,            setLangState]        = useState(getLang); // "en" | "hi"

  const changeLang = (l) => { setLang(l); setLangState(l); };
  const [installPrompt,   setInstallPrompt]   = useState(null); // PWA install prompt
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // ── Detect Supabase recovery redirect (hash contains access_token) ──────────
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace("#",""));
    const accessToken = params.get("access_token");
    const type        = params.get("type");
    if (accessToken && type === "recovery") {
      window.history.replaceState(null, "", window.location.pathname);
      setRecoveryToken(accessToken);
      setScreen("resetpw");
    }
  }, []);

  // ── Auto-open invite popup if URL has ?invite=true ────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite") === "true") {
      window.history.replaceState(null, "", window.location.pathname);
      // We're on the login screen — signal LoginScreen to open invite popup
      setAutoInvite(true);
    }
  }, []);

  // ── Capture PWA install prompt ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowInstallBanner(false);
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      // Fallback for iOS (Safari doesn't support beforeinstallprompt)
      setShowInstallBanner(false);
      showToast("On iPhone: tap Share → Add to Home Screen 📱", "info");
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      showToast("Family Kitchen added to your home screen! 🎉");
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  };

  // ── Restore saved session on app load (remember me for 48 hrs) ──────────────
  useEffect(() => {
    const raw = localStorage.getItem("fk_session");
    if (!raw) return;
    try {
      const session = JSON.parse(raw);
      const now = Date.now();
      if (!session.expiresAt || now > session.expiresAt) {
        localStorage.removeItem("fk_session");
        return;
      }
      // Session is valid — restore without asking to login again
      setAuthToken(session.token);
      setAuthUser(session.sbUser);
      setMember(session.member);
      setLoading(true);
      loadAll(session.member.family_id).then(() => {
        setScreen("app");
        setLoading(false);
        setTimeout(() => initPush(session.member.id), 2000);
      }).catch(() => {
        localStorage.removeItem("fk_session");
        setLoading(false);
      });
    } catch(e) {
      localStorage.removeItem("fk_session");
    }
  }, []); // eslint-disable-line

  const showToast = useCallback((msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── after login: load family, members, foods, planner ──
  const loadAll = useCallback(async (fid) => {
    setLoading(true);
    try {
      const [fam, mems, fds, plan] = await Promise.all([
        sbGet("families", `id=eq.${fid}&select=*`),
        sbGet("members",  `family_id=eq.${fid}&select=*`),
        sbGet("foods",    `select=*&order=category,name`),
        sbGet("planner_items", `family_id=eq.${fid}&select=*`),
      ]);
      setFamily(fam?.[0]);
      setMembers(mems||[]);
      if (!fds || fds.length===0) {
        // seed foods
        await sbPost("foods", SEED_FOODS);
        const seeded = await sbGet("foods","select=*&order=category,name");
        setFoods(seeded||[]);
      } else {
        setFoods(fds);
      }
      setPlanner(plan||[]);
      // Load favourites from localStorage (per member)
      const storedFavs = JSON.parse(localStorage.getItem(`fk_favs_${fid}`) || '{}');
      setFavs(storedFavs);
      // Build usage counts from all planner items
      const counts = {};
      (plan||[]).forEach(p => { counts[p.food_name] = (counts[p.food_name]||0) + 1; });
      setUsageCnt(counts);
    } catch(e) { showToast(e.message,"error"); }
    setLoading(false);
  }, [showToast]);

  // ── Back button: push a new history entry on every navigation ─────────────────
  // We maintain our own navStack to know exactly where to go back to
  const navStack = React.useRef([]);

  const navigate = useCallback((fn, label) => {
    // Push current state before navigating
    navStack.current.push({ view, selDay, selMeal, selMealView });
    window.history.pushState({ idx: navStack.current.length }, "", window.location.pathname);
    fn(); // perform the navigation
  }, [view, selDay, selMeal, selMealView]);

  useEffect(() => {
    if (screen !== "app") return;

    const handleBack = () => {
      const prev = navStack.current.pop();
      if (!prev) return; // nothing to go back to — OS handles it
      // Restore previous state
      setView(prev.view);
      setSelDay(prev.selDay);
      setSelMeal(prev.selMeal);
      setSelMealView(prev.selMealView);
      // Keep a state in history so next back press is catchable
      window.history.pushState({ idx: navStack.current.length }, "", window.location.pathname);
    };

    window.addEventListener("popstate", handleBack);
    // Seed one entry so first back press is interceptable
    window.history.pushState({ idx: 0 }, "", window.location.pathname);
    return () => window.removeEventListener("popstate", handleBack);
  }, [screen]); // eslint-disable-line

  // ── Background sync — refresh planner + members every 30 seconds ─────────────
  const syncData = useCallback(async (fid) => {
    if (!fid) return;
    try {
      const [plan, mems] = await Promise.all([
        sbGet("planner_items", `family_id=eq.${fid}&select=*`),
        sbGet("members",       `family_id=eq.${fid}&select=*`),
      ]);
      setPlanner(prev => {
        // Only update if data actually changed (avoid unnecessary re-renders)
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(plan||[]);
        return prevStr === nextStr ? prev : (plan||[]);
      });
      setMembers(prev => {
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(mems||[]);
        return prevStr === nextStr ? prev : (mems||[]);
      });
      // Rebuild usage counts from latest planner
      const counts = {};
      (plan||[]).forEach(p => { counts[p.food_name] = (counts[p.food_name]||0) + 1; });
      setUsageCnt(counts);
    } catch(e) { /* silent — don't toast on background sync errors */ }
  }, []);

  useEffect(() => {
    if (screen !== "app" || !family?.id) return;
    // Sync immediately when screen becomes active
    syncData(family.id);
    // Then poll every 30 seconds
    const interval = setInterval(() => syncData(family.id), 30000);
    // Also sync when tab becomes visible again (user switches back to tab)
    const onVisible = () => { if (document.visibilityState === "visible") syncData(family.id); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [screen, family?.id, syncData]);

  // Register push notifications after login
  const initPush = useCallback(async (memberId) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    if (Notification.permission === "granted") {
      await registerPush(memberId);
    }
  }, []);

  const isHead = member && family && member.id === family.head_id;

  const toggleFav = useCallback((foodId) => {
    setFavs(prev => {
      const next = { ...prev, [foodId]: !prev[foodId] };
      if (!next[foodId]) delete next[foodId];
      localStorage.setItem(`fk_favs_${family?.id}`, JSON.stringify(next));
      return next;
    });
  }, [family]);

  // ── derived planner helpers ──
  const getDayMealItems = (day, meal) => planner.filter(p => p.day===day && p.meal===meal);
  const getMealSummary  = (day, meal) => {
    const items = getDayMealItems(day, meal);
    const byMember = {};
    items.forEach(i => { if(!byMember[i.member_name]) byMember[i.member_name]=[]; byMember[i.member_name].push(i.food_name); });
    return byMember;
  };

  const addToPlanner = async (day, meal, food) => {
    if (!member) return;
    const exists = planner.find(p => p.day===day && p.meal===meal && p.food_name===food.name && p.member_name===member.name);
    if (exists) { showToast("Already added!","info"); return; }
    try {
      const row = { family_id:family.id, day, meal, food_name:food.name, food_emoji:food.emoji, member_name:member.name, finalized:false };
      const [saved] = await sbPost("planner_items", [row]);
      setPlanner(p => [...p, saved]);
      setUsageCnt(c => ({ ...c, [food.name]: (c[food.name]||0)+1 }));
      showToast(`${food.name} added to ${day}'s ${meal}!`);
      // Notify other family members
      sendPushNotification(family.id, `🍽️ ${member.name} added to ${meal}`, `${food.name} for ${day}`, member.id);
    } catch(e) { showToast(e.message,"error"); }
  };

  const removeFromPlanner = async (id) => {
    try {
      await sbDel("planner_items", `id=eq.${id}`);
      setPlanner(p => p.filter(i => i.id!==id));
    } catch(e) { showToast(e.message,"error"); }
  };

  const toggleFinalized = async (id, cur) => {
    if (!isHead) return;
    try {
      await sbPatch("planner_items", `id=eq.${id}`, { finalized:!cur });
      setPlanner(p => p.map(i => i.id===id ? {...i, finalized:!cur} : i));
      // Notify all family members when head approves
      if (!cur) {
        const item = planner.find(i => i.id===id);
        if (item) sendPushNotification(family.id, `✅ Menu Approved by ${member.name}`, `${item.food_name} on ${item.day} (${item.meal}) is confirmed!`);
      }
    } catch(e) { showToast(e.message,"error"); }
  };

  const generateShoppingList = () => {
    const finalItems = planner.filter(p => p.finalized);
    const ingMap = {};
    finalItems.forEach(pi => {
      const food = foods.find(f => f.name===pi.food_name);
      if (!food) return;
      (food.ingredients||[]).forEach(ing => {
        const key = ing.toLowerCase().trim();
        if (!ingMap[key]) ingMap[key] = { name:ing, days:[], checked:false };
        ingMap[key].days.push(`${pi.day} ${pi.meal}`);
      });
    });
    return Object.values(ingMap);
  };

  // ── Password Reset screen (after Supabase recovery redirect) ───────────────
  const t = T[lang] || T.en;

  if (screen==="resetpw") return (
    <>
      <style>{CSS}</style>
      {toast && <div className="toast" style={{ background: toast.type==="error"?"#C1440E":"#2D6A4F" }}>{toast.msg}</div>}
      <ResetPasswordScreen
        recoveryToken={recoveryToken}
        onDone={() => { setRecoveryToken(null); setScreen("login"); }}
        showToast={(msg,type) => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); }}
      />
    </>
  );

  if (screen==="login") return (
    <>
      <style>{CSS}</style>
      <LangCtx.Provider value={lang}>
      <LoginScreen lang={lang} onLangChange={changeLang} autoInvite={autoInvite} onAutoInviteDone={()=>setAutoInvite(false)} onLogin={async (token, sbUser, mem, fid) => {
        setAuthToken(token); setAuthUser(sbUser); setMember(mem);
        await loadAll(fid);
        setScreen("app");
        showToast(`Welcome, ${mem.name}! 🎉`);
        // Save session for 48 hours (remember me)
        const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
        localStorage.setItem("fk_session", JSON.stringify({ token, sbUser, member:mem, expiresAt }));
        // Request push permission after a short delay so UI is ready
        setTimeout(() => initPush(mem.id), 2000);
      }} showToast={showToast} />
      {toast && <div className="toast" style={{ background: toast.type==="error"?"#C1440E": toast.type==="info"?"#6B5CE7":"#2D6A4F" }}>{toast.msg}</div>}
      </LangCtx.Provider>
    </>
  );

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:16 }}>
        <div className="spinner" />
        <div style={{ color:"#888", fontSize:14 }}>Loading Family Kitchen…</div>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      {toast && <div className="toast" style={{ background: toast.type==="error"?"#C1440E": toast.type==="info"?"#6B5CE7":"#2D6A4F" }}>{toast.msg}</div>}

      <LangCtx.Provider value={lang}>
      <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        {/* HEADER */}
        <header style={{ background:"#fff", borderBottom:"1px solid #ede5d8", padding:"0 20px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:26 }}>👨‍👩‍👧‍👦</span>
            <div>
              <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#1A1A2E", lineHeight:1.2 }}>Family Kitchen</div>
              <div style={{ fontSize:11, color:"#999", lineHeight:1 }}>{family?.name} · <span style={{ color:"#555" }}>{member?.name||member?.username}</span>{isHead&&<span style={{ color:"#F4A200", fontWeight:700 }}> ★</span>}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"#bbb", marginRight:4 }}>ID: {family?.id?.slice(0,8)}</span>
            {showInstallBanner && (
              <button
                onClick={handleInstall}
                style={{ background:"#2D6A4F", color:"#fff", border:"none", padding:"7px 12px", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}
                title="Add to Home Screen">
                📲 Install App
              </button>
            )}
            <LangToggle lang={lang} onChange={changeLang} style={{ color:"#555", fontSize:12 }} />
            <button className="btn btn-g btn-sm" onClick={async()=>{ if(authToken) await sbSignOut(authToken); localStorage.removeItem("fk_session"); setAuthToken(null); setAuthUser(null); setScreen("login"); setMember(null); setFamily(null); setMembers([]); setFoods([]); setPlanner([]); }}>{t.signOut}</button>
          </div>
        </header>

        <div style={{ display:"flex", flex:1 }}>
          {/* SIDEBAR */}
          <aside className="sidebar" style={{ width:185, background:"#fff", borderRight:"1px solid #ede5d8", padding:"14px 10px", display:"flex", flexDirection:"column", gap:3, position:"sticky", top:60, height:"calc(100vh - 60px)", overflowY:"auto" }}>
            {[["dashboard","📅",t.dashboard],["foods","🍱",t.foodDatabase],["shopping","🛒",t.shopping],["family","👥",t.family]].map(([v,ic,lb])=>(
              <button key={v} className={`nav-btn ${view===v?"act":""}`} onClick={()=>navigate(()=>{ setView(v); setSelDay(null); setSelMeal(null); setSelMealView(null); }, v)}>{ic} {lb}</button>
            ))}
            {isHead && (
              <>
                <div style={{ borderTop:"1px dashed #ede5d8", margin:"8px 0" }} />
                <button className={`nav-btn ${view==="finalize"?"act":""}`} onClick={()=>navigate(()=>{ setView("finalize"); setSelDay(null); setSelMeal(null); setSelMealView(null); }, "finalize")}>✅ {t.finalizeMenu}</button>
              </>
            )}
            <div style={{ flex:1 }} />
            <div style={{ padding:"10px 8px", background:"#fff8f0", borderRadius:10, fontSize:11, color:"#a87800" }}>
              <div style={{ fontWeight:700 }}>Family ID</div>
              <div style={{ fontFamily:"monospace", wordBreak:"break-all", marginTop:2 }}>{family?.id}</div>
            </div>
          </aside>

          {/* MAIN */}
          <main className="main-pad" style={{ flex:1, padding:"22px 24px", overflowY:"auto", paddingBottom:120 }}>
            {view==="dashboard" && !selDay && !selMealView && <DashboardView days={DAYS} meals={MEALS} planner={planner} getMealSummary={getMealSummary} onDayClick={(d)=>navigate(()=>setSelDay(d), d)} onMealViewClick={(m)=>navigate(()=>setSelMealView(m), m)} MICONS={MICONS} MCOLS={MCOLS} showInstallBanner={showInstallBanner} onInstall={handleInstall} />}
            {view==="dashboard" && selMealView && !selDay && <MealWeekView meal={selMealView} days={DAYS} planner={planner} foods={foods} member={member} onBack={()=>setSelMealView(null)} onAdd={addToPlanner} getDayMealItems={getDayMealItems} MICONS={MICONS} isHead={isHead} onToggle={toggleFinalized} onRemove={removeFromPlanner} favs={favs} toggleFav={toggleFav} usageCnt={usageCnt} onDayClick={(d)=>navigate(()=>{ setSelMealView(null); setSelDay(d); setSelMeal(selMealView); }, d)} />}
            {view==="dashboard" && selDay && !selMeal && <DayView day={selDay} meals={MEALS} planner={planner} getMealSummary={getMealSummary} onBack={()=>{ setSelDay(null); }} onMealClick={(m)=>navigate(()=>setSelMeal(m), m)} MICONS={MICONS} MCOLS={MCOLS} isHead={isHead} onToggle={toggleFinalized} onRemove={removeFromPlanner} member={member} />}
            {view==="dashboard" && selDay && selMeal && <MealView day={selDay} meal={selMeal} foods={foods} member={member} onBack={()=>setSelMeal(null)} onAdd={addToPlanner} getMealSummary={getMealSummary} getDayMealItems={getDayMealItems} MICONS={MICONS} isHead={isHead} onToggle={toggleFinalized} onRemove={removeFromPlanner} favs={favs} toggleFav={toggleFav} usageCnt={usageCnt} />}
            {view==="foods"     && <FoodsView foods={foods} setFoods={setFoods} showToast={showToast} MEALS={MEALS} favs={favs} toggleFav={toggleFav} usageCnt={usageCnt} />}
            {view==="shopping"  && <ShoppingView genList={generateShoppingList} planner={planner} SAPPS={SAPPS} showToast={showToast} isHead={isHead} />}
            {view==="family"    && <FamilyView family={family} setFamily={setFamily} members={members} setMembers={setMembers} member={member} showToast={showToast} MCOLS={MCOLS} isHead={isHead} />}
            {view==="finalize"  && isHead && <FinalizeView days={DAYS} meals={MEALS} planner={planner} onToggle={toggleFinalized} onGenShopping={()=>navigate(()=>setView("shopping"), "shopping")} MICONS={MICONS} MCOLS={MCOLS} />}
          </main>
        </div>

        {/* BOTTOM NAV (mobile) */}
        <nav className="bnav" style={{ display:"none", position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #ede5d8", padding:"6px 8px", justifyContent:"space-around", zIndex:100 }}>
          {[["dashboard","📅",t.dashboard],["foods","🍱",t.foodDatabase],["shopping","🛒",t.shopping],["family","👥",t.family],...(isHead?[["finalize","✅",t.finalizeMenu]]:[])].map(([v,ic,lb])=>(
            <button key={v} onClick={()=>navigate(()=>{ setView(v); setSelDay(null); setSelMeal(null); setSelMealView(null); }, v)} style={{ background:view===v?"#fff8e1":"none", border:"none", cursor:"pointer", padding:"7px 10px", borderRadius:10, display:"flex", flexDirection:"column", alignItems:"center", gap:2, flex:1 }}>
              <span style={{ fontSize:18 }}>{ic}</span>
              <span style={{ fontSize:10, color:view===v?"#F4A200":"#999", fontWeight:500 }}>{lb}</span>
            </button>
          ))}
        </nav>
      </div>
      </LangCtx.Provider>
    </>
  );
}

// ─── RESET PASSWORD SCREEN (after Supabase magic link redirect) ─────────────
function ResetPasswordScreen({ recoveryToken, onDone, showToast }) {
  const [newPw,    setNewPw]    = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [busy,     setBusy]     = useState(false);
  const [done,     setDone]     = useState(false);

  const handleReset = async () => {
    if (newPw.length < 6)   { showToast("Password must be at least 6 characters","error"); return; }
    if (newPw !== confirm)   { showToast("Passwords do not match","error"); return; }
    setBusy(true);
    try {
      // Update the password using the recovery token
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        method:"PUT",
        headers:{ ...H, Authorization:`Bearer ${recoveryToken}` },
        body: JSON.stringify({ password: newPw })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.msg||d.error_description||"Failed to update password");

      // Get the user email from the recovery token
      const userEmail = d.email;

      // Check if this email has a pending member slot (invited member)
      if (userEmail) {
        const mems = await sbGet("members", `email=eq.${encodeURIComponent(userEmail)}&select=*`);
        if (mems?.length && !mems[0].auth_id) {
          // Link their auth account to the pending member slot
          await sbPatch("members", `id=eq.${mems[0].id}`, { auth_id: d.id || mems[0].id });
        }
      }

      setDone(true);
      showToast("Password set! Please sign in now.","success");
      setTimeout(() => onDone(), 2000);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(150deg,#FFF8F0,#FFF0CC 60%,#FFF8F0)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:64 }}>🔒</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:"#1A1A2E", marginTop:10 }}>Set New Password</h1>
          <p style={{ color:"#999", fontSize:13, marginTop:6 }}>Choose a strong password for your account</p>
        </div>
        <div style={{ background:"#fff", borderRadius:20, padding:28, border:"1px solid #ede5d8" }}>
          {done ? (
            <div style={{ textAlign:"center", padding:20 }}>
              <div style={{ fontSize:52 }}>✅</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, marginTop:12, color:"#2D6A4F" }}>Password Updated!</div>
              <p style={{ color:"#888", fontSize:13, marginTop:8 }}>Redirecting you to sign in...</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>New Password</label>
                <PwInput value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" />
              </div>
              <div style={{ marginBottom:22 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>Confirm Password</label>
                <PwInput value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
              </div>
              <button
                onClick={handleReset}
                disabled={busy}
                style={{ width:"100%", background:"#F4A200", color:"#fff", border:"none", padding:14, borderRadius:12, fontWeight:700, fontSize:16, cursor:busy?"not-allowed":"pointer", opacity:busy?0.7:1 }}>
                {busy ? t.updating : "Update Password →"}
              </button>
            </>
          )}
        </div>
        <div style={{ marginTop:14, background:"rgba(45,106,79,.08)", borderRadius:12, padding:"9px 14px", textAlign:"center" }}>
          <p style={{ fontSize:12, color:"#2D6A4F" }}>✅ Live — Designed by Revive Healthcare</p>
        </div>
      </div>
    </div>
  );
}


// ─── INVITE POPUP ─────────────────────────────────────────────────────────────
function InvitePopup({ show, onClose, showToast, initialEmail="", extraAction=null }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy,  setBusy]  = useState(false);
  const [sent,  setSent]  = useState(false);

  // Update email if initialEmail changes (e.g. different member clicked)
  React.useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);

  if (!show) return null;

  const handleSend = async () => {
    const em = email.trim().toLowerCase();
    if (!em) { showToast("Please enter your email","error"); return; }
    setBusy(true);
    try {
      const invited = await sbGet("members", `email=eq.${encodeURIComponent(em)}&select=family_id,name`);
      if (!invited?.length) {
        showToast("This email has not been invited yet. Ask your Kitchen Head to add you first.","error");
        setBusy(false); return;
      }
      await sbSendResetEmail(em);
      setSent(true);
      showToast("Joining link sent! Check your inbox. 📧");
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleClose = () => { setEmail(""); setSent(false); setBusy(false); onClose(); };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:9000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:400, position:"relative", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <button onClick={handleClose} style={{ position:"absolute", top:14, right:16, background:"none", border:"none", fontSize:24, cursor:"pointer", color:"#aaa", lineHeight:1 }}>×</button>
        {sent ? (
          <div style={{ textAlign:"center", padding:"10px 0" }}>
            <div style={{ fontSize:52 }}>📬</div>
            <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:20, marginTop:12, color:"#1A1A2E" }}>Joining link sent!</h3>
            <p style={{ fontSize:13, color:"#888", marginTop:8, lineHeight:1.7 }}>
              Email sent to <b>{email}</b>.<br/>
              Also share the link directly via WhatsApp:
            </p>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Hi! You have been invited to join our Family Kitchen meal planner 👨‍👩‍👧‍👦

Tap this link to join:
https://family-kitchen-gamma-rust.vercel.app?invite=true

When it opens, enter this email: ${email}
Then tap "Send Joining Link" — done!`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, width:"100%", marginTop:16, background:"#25D366", color:"#fff", padding:"13px", borderRadius:12, fontWeight:700, fontSize:15, textDecoration:"none" }}>
              <span style={{ fontSize:20 }}>💬</span> Send via WhatsApp
            </a>
            <button onClick={handleClose} className="btn btn-g" style={{ marginTop:10, width:"100%" }}>Done</button>
          </div>
        ) : (
          <>
            <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:20, marginBottom:6, color:"#1A1A2E" }}>Join Your Family</h3>
            <p style={{ fontSize:13, color:"#888", marginBottom:20, lineHeight:1.6 }}>
              Enter the email your Kitchen Head used to invite you. We will send you a link to set your password and join instantly.
            </p>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:6 }}>Your Invited Email</label>
            <input
              className="input"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              placeholder="email your Kitchen Head added"
              type="email"
              autoComplete="email"
              onKeyDown={e=>e.key==="Enter"&&handleSend()}
              style={{ marginBottom:16 }}
            />
            <button className="btn btn-p" onClick={handleSend} disabled={busy} style={{ width:"100%", padding:13, fontSize:15 }}>
              {busy ? "Sending..." : "Send Joining Link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PASSWORD INPUT with show/hide toggle ────────────────────────────────────
function PwInput({ value, onChange, placeholder="Password", autoComplete="current-password" }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <input
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        style={{ paddingRight:44 }}
      />
      <button
        type="button"
        onClick={()=>setShow(s=>!s)}
        style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:17, padding:2, lineHeight:1, opacity:.6 }}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
const BG = "linear-gradient(150deg,#FFF8F0,#FFF0CC 60%,#FFF8F0)";

function LoginWrap({ children, title, sub, icon, langToggle }) {
  return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:430 }}>
        {/* Language toggle top right */}
        {langToggle && <div style={{ textAlign:"right", marginBottom:8 }}>{langToggle}</div>}
        <div style={{ textAlign:"center", marginBottom:26 }}>
          <div style={{ fontSize: icon && icon.length > 2 ? 48 : 66 }}>{icon || "👨‍👩‍👧‍👦"}</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, color:"#1A1A2E", marginTop:8 }}>{title}</h1>
          {sub && <p style={{ color:"#999", fontSize:13, marginTop:5 }}>{sub}</p>}
        </div>
        {children}
        <div style={{ marginTop:14, background:"rgba(45,106,79,.08)", borderRadius:12, padding:"9px 14px", textAlign:"center" }}>
          <p style={{ fontSize:12, color:"#2D6A4F" }}>✅ Live — Designed by Revive Healthcare</p>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, showToast, autoInvite, onAutoInviteDone, lang="en", onLangChange }) {
  const t = T[lang] || T.en;
  const [step,      setStep]     = useState("auth");
  const [authMode,  setAuthMode] = useState("signin");
  const [busy,      setBusy]     = useState(false);
  const [username,  setUsername] = useState("");
  const [email,     setEmail]    = useState("");
  const [password,  setPassword] = useState("");
  const [confirmPw, setConfirmPw]= useState("");
  const [famMode,   setFamMode]  = useState("create");
  const [famName,   setFamName]  = useState("");
  const [famPw,     setFamPw]    = useState("");
  const [famId,     setFamId]    = useState("");
  const [authToken, setAuthToken]= useState(null);
  const [authUser,  setAuthUser] = useState(null);
  const [savedName, setSavedName]= useState("");
  const [fpEmail,   setFpEmail]  = useState("");
  const [fpNewPw,   setFpNewPw]  = useState("");
  const [fpConfirm, setFpConfirm]= useState("");
  const [fpToken,   setFpToken]  = useState(null);
  const [showInvitePopup, setShowInvitePopup] = useState(false);

  // Auto-open popup if directed from invite link
  React.useEffect(() => {
    if (autoInvite) { setShowInvitePopup(true); if(onAutoInviteDone) onAutoInviteDone(); }
  }, [autoInvite]); // eslint-disable-line

  const handleAuth = async () => {
    if (!email.trim()) { showToast("Email is required","error"); return; }
    if (!password)     { showToast("Password is required","error"); return; }
    setBusy(true);
    try {
      if (authMode === "signin") {
        const { access_token, user } = await sbSignIn(email.trim().toLowerCase(), password);
        let mems = await sbGet("members", `auth_id=eq.${user.id}&select=*`);
        if (!mems?.length) {
          const byEmail = await sbGet("members", `email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=*`);
          if (byEmail?.length) {
            await sbPatch("members", `id=eq.${byEmail[0].id}`, { auth_id: user.id });
            mems = [{ ...byEmail[0], auth_id: user.id }];
          }
        }
        if (mems?.length) {
          onLogin(access_token, user, mems[0], mems[0].family_id);
        } else {
          setAuthToken(access_token); setAuthUser(user);
          setStep("family");
        }
      } else {
        if (!username.trim())       { showToast("Username is required","error"); setBusy(false); return; }
        if (password.length < 6)    { showToast("Password must be at least 6 characters","error"); setBusy(false); return; }
        if (password !== confirmPw) { showToast("Passwords do not match","error"); setBusy(false); return; }
        const emailLc = email.trim().toLowerCase();
        const { access_token, user } = await sbSignUp(emailLc, password);
        setSavedName(username.trim());
        setAuthToken(access_token); setAuthUser(user);
        // Check for pre-invite
        const preInvited = await sbGet("members", `email=eq.${encodeURIComponent(emailLc)}&select=*`);
        if (preInvited?.length) {
          const slot = preInvited[0];
          await sbPatch("members", `id=eq.${slot.id}`, { auth_id: user.id, username: username.trim(), name: username.trim() });
          const updated = { ...slot, auth_id: user.id, username: username.trim(), name: username.trim() };
          onLogin(access_token, user, updated, slot.family_id);
        } else {
          setStep("family");
        }
      }
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleFamily = async () => {
    setBusy(true);
    try {
      const displayName  = savedName || username.trim() || "Member";
      const memberEmail  = authUser?.email || email.trim().toLowerCase();
      if (famMode === "create") {
        if (!famPw) { showToast("Please set a family password","error"); setBusy(false); return; }
        const newFamId = "FAM-" + Math.random().toString(36).substr(2,6).toUpperCase();
        const [fam] = await sbPost("families", [{ id:newFamId, name:famName||`${displayName}'s Family`, password:famPw, head_id:null }]);
        const [mem] = await sbPost("members",  [{ auth_id:authUser.id, family_id:fam.id, name:displayName, username:displayName, email:memberEmail, role:"head" }]);
        await sbPatch("families", `id=eq.${fam.id}`, { head_id:mem.id });
        onLogin(authToken, authUser, mem, fam.id);
      } else {
        if (!famId || !famPw) { showToast("Family ID and password are required","error"); setBusy(false); return; }
        const fams = await sbGet("families", `id=eq.${famId.trim().toUpperCase()}&password=eq.${famPw}&select=*`);
        if (!fams?.length) { showToast("Family not found or wrong family password","error"); setBusy(false); return; }
        const [mem] = await sbPost("members", [{ auth_id:authUser.id, family_id:fams[0].id, name:displayName, username:displayName, email:memberEmail, role:"member" }]);
        onLogin(authToken, authUser, mem, fams[0].id);
      }
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const handleSendOTP = async () => {
    if (!fpEmail.trim()) { showToast("Please enter your email","error"); return; }
    setBusy(true);
    try {
      await sbSendResetEmail(fpEmail.trim().toLowerCase());
      showToast("Reset link sent! Check your inbox 📧");
      setStep("sent");
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  // ── FORGOT ────────────────────────────────────────────────────────────────
  if (step === "forgot") return (
    <LoginWrap title="Forgot Password" sub="Reset your password via email" icon="🔐">
      <div className="card" style={{ padding:24 }}>
        <button onClick={()=>setStep("auth")} style={{ background:"none", border:"none", color:"#aaa", cursor:"pointer", fontSize:13, marginBottom:16 }}>← Back to Sign In</button>
        <p style={{ fontSize:13, color:"#999", marginBottom:18 }}>Enter your registered email. We will send you a reset link.</p>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Registered Email</label>
          <input className="input" value={fpEmail} onChange={e=>setFpEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" />
        </div>
        <button className="btn btn-p" onClick={handleSendOTP} disabled={busy} style={{ width:"100%", padding:12 }}>
          {busy ? "Sending..." : "📧 Send Reset Link"}
        </button>
      </div>
    </LoginWrap>
  );

  // ── SENT ──────────────────────────────────────────────────────────────────
  if (step === "sent") return (
    <LoginWrap title="Reset Link Sent" icon="📧">
      <div className="card" style={{ padding:28, textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:16 }}>📬</div>
        <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"#1A1A2E", marginBottom:10 }}>Check your inbox</h3>
        <p style={{ fontSize:14, color:"#555", lineHeight:1.7, marginBottom:6 }}>We sent a password reset link to</p>
        <p style={{ fontSize:15, fontWeight:700, color:"#1A1A2E", marginBottom:20 }}>{fpEmail}</p>
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:16, marginBottom:24, textAlign:"left" }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#2D6A4F", marginBottom:8 }}>What to do next:</div>
          <div style={{ fontSize:13, color:"#555", lineHeight:1.8 }}>
            1. Open the email from Supabase<br/>
            2. Click the <b>Reset Password</b> link<br/>
            3. You will be brought back here to set your new password
          </div>
        </div>
        <span style={{ fontSize:13, color:"#aaa" }}>Did not receive it? </span>
        <span style={{ fontSize:13, color:"#F4A200", cursor:"pointer", fontWeight:600 }} onClick={()=>{ setBusy(false); handleSendOTP(); }}>Resend link</span>
        <button onClick={()=>setStep("forgot")} style={{ display:"block", margin:"12px auto 0", background:"none", border:"none", color:"#bbb", fontSize:12, cursor:"pointer" }}>← Change email</button>
      </div>
    </LoginWrap>
  );

  // ── FAMILY SETUP ──────────────────────────────────────────────────────────
  if (step === "family") return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:430 }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:52 }}>🏠</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#1A1A2E", marginTop:8 }}>Set Up Your Family</h2>
          <p style={{ color:"#999", fontSize:13, marginTop:5 }}>Hi {savedName||username||"there"}! Create a new group or join your family.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:18 }}>
          {[["create","🆕","Create Family","Start a new group"],["join","🔗","Join Family","Use an existing Family ID"]].map(([m,ic,l,sub])=>(
            <div key={m} onClick={()=>setFamMode(m)} style={{ background:"#fff", border:`2px solid ${famMode===m?"#F4A200":"#ede5d8"}`, borderRadius:14, padding:16, cursor:"pointer", textAlign:"center", transition:"all .18s" }}>
              <div style={{ fontSize:28 }}>{ic}</div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1A1A2E", marginTop:6 }}>{l}</div>
              <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding:22 }}>
          {famMode === "create" ? (
            <>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family Name</label>
                <input className="input" value={famName} onChange={e=>setFamName(e.target.value)} placeholder={`${savedName||"Our"}'s Family`} />
              </div>
              <div style={{ marginBottom:6 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family Password <span style={{ color:"#aaa", fontWeight:400 }}>(share with members)</span></label>
                <PwInput value={famPw} onChange={e=>setFamPw(e.target.value)} placeholder="e.g. sharma123" autoComplete="new-password" />
              </div>
              <p style={{ fontSize:11, color:"#aaa", marginBottom:16, marginTop:6 }}>You will be set as the Kitchen Head. Your Family ID is auto-generated.</p>
            </>
          ) : (
            <>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family ID</label>
                <input className="input" value={famId} onChange={e=>setFamId(e.target.value.toUpperCase())} placeholder="FAM-XXXXXX" />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Family Password</label>
                <PwInput value={famPw} onChange={e=>setFamPw(e.target.value)} placeholder="Ask your Kitchen Head" />
              </div>
            </>
          )}
          <button className="btn btn-p" onClick={handleFamily} disabled={busy} style={{ width:"100%", padding:13, fontSize:15 }}>
            {busy ? "Please wait..." : famMode==="create" ? "Create My Family" : "Join Family"}
          </button>
        </div>
        <button onClick={()=>setStep("auth")} style={{ display:"block", margin:"14px auto 0", background:"none", border:"none", color:"#aaa", fontSize:12, cursor:"pointer" }}>← Back to Sign In</button>
      </div>
    </div>
  );

  // ── AUTH (Sign In / Register) ─────────────────────────────────────────────
  return (
    <LoginWrap title={t.appName} sub={t.appTagline} langToggle={<LangToggle lang={lang} onChange={onLangChange} style={{ color:"#2D6A4F" }} />}>
      <InvitePopup show={showInvitePopup} onClose={()=>setShowInvitePopup(false)} showToast={showToast} />
      <div className="card" style={{ padding:26 }}>
        {/* Tabs */}
        <div style={{ display:"flex", background:"#f5f0e8", borderRadius:10, padding:4, marginBottom:22, gap:2 }}>
          {[["signin","Sign In"],["register","Register"]].map(([m,l])=>(
            <button key={m} onClick={()=>{ setAuthMode(m); setPassword(""); setConfirmPw(""); }} style={{ flex:1, padding:"9px 4px", borderRadius:8, border:"none", background:authMode===m?"#fff":"transparent", fontWeight:authMode===m?700:400, fontSize:13, cursor:"pointer", color:authMode===m?"#1A1A2E":"#999", boxShadow:authMode===m?"0 1px 5px rgba(0,0,0,.08)":"none", transition:"all .18s" }}>{l}</button>
          ))}
        </div>

        {authMode === "register" && (
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.username} <span style={{ color:"#aaa", fontWeight:400 }}>{t.usernameSub}</span></label>
            <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. Amit" autoComplete="username" />
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.email}</label>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@gmail.com" type="email" autoComplete="email" />
        </div>
        <div style={{ marginBottom: authMode==="register" ? 14 : 6 }}>
          <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.password}</label>
          <PwInput value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==="register"?"Min. 6 characters":"Your password"} autoComplete={authMode==="register"?"new-password":"current-password"} />
        </div>
        {authMode === "register" && (
          <div style={{ marginBottom:6 }}>
            <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.confirmPassword}</label>
            <PwInput value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
          </div>
        )}
        {authMode === "signin" && (
          <div style={{ textAlign:"right", marginBottom:16 }}>
            <span style={{ fontSize:12, color:"#F4A200", cursor:"pointer", fontWeight:600 }} onClick={()=>{ setFpEmail(email); setStep("forgot"); }}>{t.forgotPassword}</span>
          </div>
        )}

        <button className="btn btn-p" onClick={handleAuth} disabled={busy} style={{ width:"100%", padding:13, fontSize:15, marginTop: authMode==="register"?14:0 }}>
          {busy ? t.pleaseWait : authMode==="signin" ? t.signIn : t.createAccount}
        </button>

        <div style={{ textAlign:"center", marginTop:14, paddingTop:14, borderTop:"1px solid #f5f0e8" }}>
          <span style={{ fontSize:12, color:"#aaa" }}>Invited by a family member? </span>
          <span style={{ fontSize:12, color:"#2D6A4F", cursor:"pointer", fontWeight:600 }} onClick={()=>setShowInvitePopup(true)}>Get joining link</span>
        </div>
      </div>
    </LoginWrap>
  );
}


// ─── MEAL WEEK VIEW — shows one meal across all 7 days ───────────────────────
function MealWeekView({ meal, days, planner, foods, member, onBack, onAdd, getDayMealItems, MICONS, isHead, onToggle, onRemove, favs, toggleFav, usageCnt, onDayClick }) {
  const t = useT();
  const [expandedDay, setExpandedDay] = useState(null);
  const mealFoods = foods.filter(f => (Array.isArray(f.categories)?f.categories:[f.category].filter(Boolean)).includes(meal));
  const sortedFoods = [...mealFoods].sort((a,b) => {
    const af=favs[a.id]?1:0, bf=favs[b.id]?1:0;
    if (bf!==af) return bf-af;
    const au=usageCnt[a.name]||0, bu=usageCnt[b.name]||0;
    if (bu!==au) return bu-au;
    return a.name.localeCompare(b.name);
  });

  const [search, setSearch] = useState("");
  const filtered = search ? sortedFoods.filter(f=>f.name.toLowerCase().includes(search.toLowerCase())) : sortedFoods;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button className="btn btn-g btn-sm" onClick={onBack}>← Dashboard</button>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{MICONS[meal]} {meal} — All Week</h2>
          <p style={{ fontSize:12, color:"#999", marginTop:2 }}>View and add {meal.toLowerCase()} for each day</p>
        </div>
      </div>

      {/* Week grid — one card per day */}
      <div style={{ display:"grid", gap:10, marginBottom:22 }}>
        {days.map(day => {
          const items = getDayMealItems(day, meal);
          const isToday = day === new Date().toLocaleDateString("en",{weekday:"long"});
          const isOpen  = expandedDay === day;
          return (
            <div key={day} className="card" style={{ border: isToday?"2px solid #F4A200":"1px solid #ede5d8" }}>
              {/* Day header — click to expand food picker */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }} onClick={()=>setExpandedDay(isOpen?null:day)}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {isToday && <span style={{ background:"#F4A200", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>TODAY</span>}
                  <span className="serif" style={{ fontSize:16, fontWeight:700, color:"#1A1A2E" }}>{day}</span>
                  {items.length>0 && <span style={{ background:"#fff8e1", color:"#a87800", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>{items.length} selected</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {items.length===0 && <span style={{ fontSize:12, color:"#ccc" }}>+ Add</span>}
                  <span style={{ color:"#F4A200", fontSize:18, transform:isOpen?"rotate(90deg)":"none", transition:"transform .2s" }}>›</span>
                </div>
              </div>

              {/* Current selections for this day */}
              {items.length>0 && (
                <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6 }}>
                  {items.map(item=>(
                    <div key={item.id} style={{ display:"flex", alignItems:"center", gap:5, background:item.finalized?"#e8f5e9":"#f5f5f5", border:`1px solid ${item.finalized?"#c8e6c9":"#eee"}`, borderRadius:20, padding:"4px 10px", fontSize:12 }}>
                      <span>{item.food_emoji} {item.food_name}</span>
                      <span style={{ color:"#aaa", fontSize:10 }}>— {item.member_name}</span>
                      {(isHead || item.member_name===member?.name) && (
                        <button onClick={e=>{e.stopPropagation();onRemove(item.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffaaaa", fontSize:14, padding:"0 2px", lineHeight:1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Expandable food picker */}
              {isOpen && (
                <div style={{ marginTop:14, borderTop:"1px solid #f0e8d8", paddingTop:14 }}>
                  <div style={{ position:"relative", marginBottom:12 }}>
                    <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#bbb" }}>🔍</span>
                    <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${meal} items...`} style={{ paddingLeft:32, paddingRight:search?32:12 }} />
                    {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#bbb", fontSize:16 }}>×</button>}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8 }}>
                    {filtered.slice(0,12).map(food=>(
                      <div key={food.id||food.name} className="food-card" style={{ padding:10, position:"relative" }}>
                        <button onClick={e=>{e.stopPropagation();toggleFav(food.id);}} style={{ position:"absolute", top:5, right:5, background:"none", border:"none", cursor:"pointer", fontSize:13 }}>
                          {favs[food.id]?"❤️":"🤍"}
                        </button>
                        <div style={{ fontSize:32, textAlign:"center", marginBottom:5 }}>{food.emoji}</div>
                        <div style={{ fontWeight:600, fontSize:12, textAlign:"center", marginBottom:2 }}>{food.name}</div>
                        <div style={{ fontSize:10, color:"#aaa", textAlign:"center", marginBottom:7 }}>{food.calories} kcal</div>
                        <button className="btn btn-p btn-sm" style={{ width:"100%", fontSize:11, padding:"5px" }} onClick={()=>{ onAdd(day, meal, food); }}>+ Add</button>
                      </div>
                    ))}
                    {filtered.length===0 && <div style={{ gridColumn:"1/-1", textAlign:"center", color:"#ccc", padding:20, fontSize:13 }}>No results for "{search}"</div>}
                  </div>
                  {filtered.length>12 && (
                    <div style={{ textAlign:"center", marginTop:10 }}>
                      <button className="btn btn-g btn-sm" onClick={()=>onDayClick(day)}>See all {filtered.length} items →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({ days, meals, planner, getMealSummary, onDayClick, onMealViewClick, MICONS, MCOLS, showInstallBanner, onInstall }) {
  const t   = useT();
  const now = new Date();
  const today = now.toLocaleDateString("en",{weekday:"long"});
  const totalWeek = planner.length;
  const finalizedCount = planner.filter(p=>p.finalized).length;

  // Re-order days starting from today, and compute actual dates for each
  const todayIdx = days.indexOf(today);
  const orderedDays = todayIdx >= 0
    ? [...days.slice(todayIdx), ...days.slice(0, todayIdx)]
    : days;

  // Map each day name to its actual calendar date
  const dayDates = {};
  orderedDays.forEach((day, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dayDates[day] = d;
  });

  const fmtDate = (d) => d.toLocaleDateString("en-IN", { day:"numeric", month:"short" });

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 className="serif" style={{ fontSize:26, color:"#1A1A2E" }}>{t.weeklyMealPlanner}</h2>
        <p style={{ color:"#999", fontSize:13, marginTop:4 }}>{totalWeek} {t.selectionsThisWeek} · {finalizedCount} {t.finalized}</p>
      </div>
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={{ background:"linear-gradient(135deg,#2D6A4F,#1a4a35)", borderRadius:14, padding:"14px 18px", marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>📲 Add to Home Screen</div>
            <div style={{ color:"rgba(255,255,255,.75)", fontSize:12, marginTop:3 }}>Access Family Kitchen like an app — no browser needed</div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            <button onClick={onInstall} style={{ background:"#F4A200", color:"#fff", border:"none", padding:"8px 16px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer" }}>Install</button>
            <button onClick={()=>onInstall && document.querySelector(".install-banner")?.remove()} style={{ background:"rgba(255,255,255,.15)", color:"#fff", border:"none", padding:"8px 10px", borderRadius:9, fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        </div>
      )}
      {/* week summary strip — always 4 cols, slim for mobile */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:18 }}>
        {meals.map(m=>{
          const c = planner.filter(p=>p.meal===m).length;
          return <div key={m} className="card-hover" onClick={()=>onMealViewClick(m)} style={{ background:"#fff", borderRadius:10, padding:"8px 4px", border:"1px solid #ede5d8", textAlign:"center", cursor:"pointer" }}>
            <div style={{ fontSize:18 }}>{MICONS[m]}</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#1A1A2E", marginTop:2, lineHeight:1 }}>{c}</div>
            <div style={{ fontSize:10, color:"#999", marginTop:2, lineHeight:1.2 }}>{lang==="hi" ? {"Breakfast":t.breakfast,"Lunch":t.lunch,"Evening Snack":t.eveningSnack,"Dinner":t.dinner}[m]||m : m.replace("Evening Snack","Snack").replace("Breakfast","Bfast")}</div>
            <div style={{ fontSize:9, color:"#F4A200", marginTop:3, fontWeight:600 }}>View →</div>
          </div>;
        })}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px,1fr))", gap:14 }}>
        {orderedDays.map(day=>{
          const isToday   = day===today;
          const dateObj   = dayDates[day];
          const isTomorrow= dateObj && (dateObj.getDate() - now.getDate() === 1 && dateObj.getMonth()===now.getMonth());
          const total     = meals.reduce((a,m)=>a+(planner.filter(p=>p.day===day&&p.meal===m).length),0);
          const finCount  = planner.filter(p=>p.day===day&&p.finalized).length;
          return (
            <div key={day} className="card card-hover" onClick={()=>onDayClick(day)} style={{ border: isToday?"2px solid #F4A200":"1px solid #ede5d8", position:"relative", overflow:"hidden" }}>
              {/* Badge */}
              {isToday && <div style={{ position:"absolute", top:0, right:0, background:"#F4A200", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:"0 0 0 8px" }}>TODAY</div>}
              {isTomorrow && <div style={{ position:"absolute", top:0, right:0, background:"#2D6A4F", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:"0 0 0 8px" }}>TOMORROW</div>}
              {/* Day name + date */}
              <div style={{ marginBottom:8 }}>
                <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#1A1A2E", lineHeight:1.2 }}>{day}</div>
                {dateObj && <div style={{ fontSize:11, color: isToday?"#F4A200":"#aaa", fontWeight: isToday?700:400, marginTop:2 }}>{fmtDate(dateObj)}</div>}
              </div>
              {meals.map(meal=>{
                const items = planner.filter(p=>p.day===day&&p.meal===meal);
                return <div key={meal} className="meal-row">
                  <span style={{ fontSize:12, color:"#888" }}>{MICONS[meal]} {meal.replace(" Snack","Snk")}</span>
                  <span style={{ fontSize:11, background:items.length>0?"#fff8e1":"#f5f5f5", color:items.length>0?"#a87800":"#ccc", padding:"2px 7px", borderRadius:20, fontWeight:700 }}>{items.length||"—"}</span>
                </div>;
              })}
              {total>0 && <div style={{ marginTop:8, fontSize:11, color:"#2D6A4F", fontWeight:500 }}>📋 {total} items · {finCount} ✓</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────
function DayView({ day, meals, planner, getMealSummary, onBack, onMealClick, MICONS, MCOLS, isHead, onToggle, onRemove, member }) {
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-g btn-sm" onClick={onBack}>← Week</button>
        <div><h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{day}</h2><p style={{ fontSize:12, color:"#999" }}>Tap a meal to view or add items</p></div>
      </div>
      <div style={{ display:"grid", gap:14 }}>
        {meals.map(meal=>{
          const summary = getMealSummary(day, meal);
          const items = planner.filter(p=>p.day===day&&p.meal===meal);
          const mems = Object.keys(summary);
          return (
            <div key={meal} className="card" style={{ cursor:"pointer" }} onClick={()=>onMealClick(meal)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:mems.length?12:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:30 }}>{MICONS[meal]}</span>
                  <div>
                    <div style={{ fontWeight:600, fontSize:16, color:"#1A1A2E" }}>{meal}</div>
                    <div style={{ fontSize:12, color:"#999" }}>{items.length} item{items.length!==1?"s":""} selected</div>
                  </div>
                </div>
                <span style={{ color:"#F4A200", fontSize:22, marginTop:2 }}>›</span>
              </div>
              {mems.length>0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {mems.map((mem,mi)=>(
                    <div key={mem} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:MCOLS[mi%MCOLS.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>{mem[0]}</div>
                      <div style={{ flex:1, fontSize:13, color:"#555" }}><b style={{ color:"#333" }}>{mem}:</b> {summary[mem].join(", ")}</div>
                    </div>
                  ))}
                </div>
              )}
              {mems.length===0 && <div style={{ color:"#ccc", fontSize:12, textAlign:"center", padding:"8px 0" }}>+ Tap to add meals</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MEAL VIEW ────────────────────────────────────────────────────────────────
function MealView({ day, meal, foods, member, onBack, onAdd, getMealSummary, getDayMealItems, MICONS, isHead, onToggle, onRemove, favs, toggleFav, usageCnt }) {
  const t = useT();
  const lang = useLang();
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const searchRef = React.useRef();

  const mealFoods = foods.filter(f => (Array.isArray(f.categories)?f.categories:[f.category].filter(Boolean)).includes(meal));
  const currentItems = getDayMealItems(day, meal);
  const summary = getMealSummary(day, meal);

  // Sort: favourites first → then by usage count → then alpha
  const sortedFoods = [...mealFoods].sort((a,b) => {
    const af = favs[a.id]?1:0, bf = favs[b.id]?1:0;
    if (bf!==af) return bf-af;
    const au = usageCnt[a.name]||0, bu = usageCnt[b.name]||0;
    if (bu!==au) return bu-au;
    return a.name.localeCompare(b.name);
  });

  const filtered = search.trim()
    ? sortedFoods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || (f.ingredients||[]).some(i=>i.toLowerCase().includes(search.toLowerCase())))
    : sortedFoods;

  const favFoods  = filtered.filter(f => favs[f.id]);
  const otherFoods= filtered.filter(f => !favs[f.id]);

  // Detail view
  if (detail) return (
    <div>
      <button className="btn btn-g btn-sm" onClick={()=>setDetail(null)} style={{ marginBottom:16 }}>← Back to {meal}</button>
      <div className="card">
        {/* Fav toggle on detail */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
          <button onClick={()=>toggleFav(detail.id)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:24 }} title={favs[detail.id]?"Remove from favourites":"Add to favourites"}>
            {favs[detail.id] ? "❤️" : "🤍"}
          </button>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:140, height:140, borderRadius:16, overflow:"hidden", margin:"0 auto 12px", background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <FoodImage food={detail} size={140} radius={16} />
          </div>
          <h2 className="serif" style={{ fontSize:24, marginTop:8 }}>{(lang==="hi"&&detail.name_hi)||detail.name}</h2>
          <p style={{ color:"#999", fontSize:13, marginTop:4 }}>📏 Portion: <b style={{ color:"#555" }}>{detail.portion}</b></p>
          {usageCnt[detail.name]>0 && <p style={{ color:"#2D6A4F", fontSize:12, marginTop:4 }}>✓ Added {usageCnt[detail.name]} time{usageCnt[detail.name]!==1?"s":""} this week</p>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, margin:"18px 0" }}>
          {[["Calories",detail.calories,"kcal","#F4A200"],["Protein",detail.protein,"g","#2D6A4F"],["Carbs",detail.carbs,"g","#6B5CE7"],["Fat",detail.fat,"g","#C1440E"],["Fiber",detail.fiber,"g","#00BCD4"]].map(([k,v,u,c])=>(
            <div key={k} className="nut-pill" style={{ background:"#f9f9f9", borderTop:`3px solid ${c}` }}>
              <div style={{ fontSize:15, fontWeight:700, color:c }}>{v}{u}</div>
              <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{k}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontWeight:600, color:"#1A1A2E", marginBottom:8, fontSize:14 }}>🛒 Ingredients</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{(detail.ingredients||[]).map((ing,i)=><span key={i} className="tag">{ing}</span>)}</div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontWeight:600, color:"#1A1A2E", marginBottom:8, fontSize:14 }}>👨‍🍳 Recipe</div>
          <p style={{ fontSize:13, color:"#555", lineHeight:1.75 }}>{detail.recipe}</p>
        </div>
        {detail.youtube && <a href={detail.youtube} target="_blank" rel="noreferrer" style={{ display:"block", background:"#ff0000", color:"#fff", textAlign:"center", padding:11, borderRadius:10, textDecoration:"none", fontWeight:700, fontSize:14, marginBottom:10 }}>▶ Watch on YouTube</a>}
        <button className="btn btn-p" onClick={()=>{ onAdd(day, meal, detail); setDetail(null); }} style={{ width:"100%" }}>+ Add to {day}'s {meal}</button>
      </div>
    </div>
  );

  const FoodCard = ({ food }) => {
    const isFav = favs[food.id];
    const usage = usageCnt[food.name]||0;
    return (
      <div className="food-card" style={{ position:"relative" }}>
        {/* Fav heart */}
        <button onClick={e=>{ e.stopPropagation(); toggleFav(food.id); }}
          style={{ position:"absolute", top:6, right:6, background:"rgba(255,255,255,.85)", border:"none", cursor:"pointer", fontSize:16, borderRadius:"50%", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2 }}>
          {isFav ? "❤️" : "🤍"}
        </button>
        {usage>0 && <div style={{ position:"absolute", top:6, left:6, background:"#2D6A4F", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:10, zIndex:2 }}>×{usage}</div>}
        <div style={{ width:"100%", height:90, borderRadius:10, overflow:"hidden", marginBottom:8, background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <FoodImage food={food} size={80} radius={0} />
        </div>
        <div style={{ fontWeight:600, textAlign:"center", fontSize:14, marginBottom:3 }}>{food.name}</div>
        <div style={{ fontSize:11, color:"#aaa", textAlign:"center", marginBottom:9 }}>{food.portion}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:10 }}>
          <div style={{ background:"#fff8e1", borderRadius:7, padding:"5px 3px", textAlign:"center" }}><div style={{ fontSize:13, fontWeight:700, color:"#a87800" }}>{food.calories}</div><div style={{ fontSize:9, color:"#cca000" }}>kcal</div></div>
          <div style={{ background:"#e8f5e9", borderRadius:7, padding:"5px 3px", textAlign:"center" }}><div style={{ fontSize:13, fontWeight:700, color:"#2D6A4F" }}>{food.protein}g</div><div style={{ fontSize:9, color:"#4caf50" }}>protein</div></div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button className="btn btn-g btn-sm" onClick={()=>setDetail(food)} style={{ flex:1 }}>Info</button>
          <button className="btn btn-p btn-sm" onClick={()=>onAdd(day,meal,food)} style={{ flex:1 }}>+ Add</button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <button className="btn btn-g btn-sm" onClick={onBack}>← {day}</button>
        <div><h2 className="serif" style={{ fontSize:20, color:"#1A1A2E" }}>{MICONS[meal]} {meal} — {day}</h2></div>
      </div>

      {currentItems.length>0 && (
        <div className="card" style={{ marginBottom:14, background:"#fffdf7" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#a87800", marginBottom:8 }}>📋 Current Selections</div>
          {currentItems.map(item=>(
            <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid #f5f0e8" }}>
              <span style={{ fontSize:13 }}>{item.food_emoji} <b>{item.food_name}</b> <span style={{ color:"#aaa", fontSize:11 }}>— {item.member_name}</span>{item.finalized&&<span style={{ color:"#2D6A4F", fontSize:11 }}> ✓</span>}</span>
              {(isHead || item.member_name===member?.name) && <button onClick={e=>{e.stopPropagation();onRemove(item.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffaaaa", fontSize:16, padding:"0 4px" }}>✕</button>}
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div style={{ position:"relative", marginBottom:16 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, color:"#bbb" }}>🔍</span>
        <input
          ref={searchRef}
          className="input"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder={`Search ${meal} items or ingredients…`}
          style={{ paddingLeft:38, paddingRight: search?36:14 }}
        />
        {search && <button onClick={()=>{ setSearch(""); searchRef.current?.focus(); }} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#bbb", fontSize:18 }}>✕</button>}
      </div>

      {filtered.length===0 && (
        <div style={{ textAlign:"center", padding:40, color:"#ccc" }}>
          <div style={{ fontSize:40 }}>🔍</div>
          <div style={{ marginTop:10 }}>No results for "{search}"</div>
        </div>
      )}

      {/* Favourites section */}
      {favFoods.length>0 && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:14 }}>❤️</span>
            <h3 style={{ fontSize:13, fontWeight:700, color:"#C1440E", textTransform:"uppercase", letterSpacing:.5 }}>Favourites</h3>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:13, marginBottom:20 }}>
            {favFoods.map(food=><FoodCard key={food.id||food.name} food={food} />)}
          </div>
        </>
      )}

      {/* All / remaining items */}
      {otherFoods.length>0 && (
        <>
          {favFoods.length>0 && <h3 style={{ fontSize:13, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>All Items</h3>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:13 }}>
            {otherFoods.map(food=><FoodCard key={food.id||food.name} food={food} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── FOOD IMAGE — shows photo if available, else emoji ───────────────────────
function FoodImage({ food, size=48, radius=8 }) {
  if (food.photo_url) return (
    <img src={food.photo_url} alt={food.name}
      style={{ width:size, height:size, objectFit:"cover", borderRadius:radius, display:"block" }} />
  );
  return <div style={{ fontSize:size*0.65, textAlign:"center", lineHeight:1, width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center" }}>{food.emoji||"🍽️"}</div>;
}


// ─── FOOD DATABASE ─────────────────────────────────────────────────────────────
function FoodsView({ foods, setFoods, showToast, MEALS, favs, toggleFav, usageCnt }) {
  const t = useT();
  const lang = useLang();
  const [cat,          setCat]         = useState("All");
  const [form,         setForm]        = useState(null);
  const [busy,         setBusy]        = useState(false);
  const [photoPreview, setPhotoPreview]= useState(null);
  const [search,       setSearch]      = useState("");
  const [importMode,   setImportMode]  = useState(null);
  const [aiInput,      setAiInput]     = useState("");
  const [aiBusy,       setAiBusy]      = useState(false);
  const [aiPreview,    setAiPreview]   = useState([]);
  const fileRef  = React.useRef();
  const csvRef   = React.useRef();
  const searchRef= React.useRef();

  const EXTRA_CATS = ["Dessert","Drinks","Salad","Soup","Street Food","Side Dish"];
  const ALL_CATS   = ["All", ...MEALS, ...EXTRA_CATS];
  const foodCats   = fd => Array.isArray(fd.categories) ? fd.categories : [fd.category].filter(Boolean);

  const filtered = (() => {
    let list = cat==="All" ? foods : foods.filter(fd => foodCats(fd).includes(cat));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || foodCats(f).some(c=>c.toLowerCase().includes(q)));
    }
    return [...list].sort((a,b) => {
      const af=favs[a.id]?1:0, bf=favs[b.id]?1:0;
      if (bf!==af) return bf-af;
      const au=usageCnt[a.name]||0, bu=usageCnt[b.name]||0;
      if (bu!==au) return bu-au;
      return a.name.localeCompare(b.name);
    });
  })();

  const fv = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const startAdd  = () => { setPhotoPreview(null); setForm({ name:"", name_hi:"", categories:["Breakfast"], emoji:"🍽️", photo_url:"", calories:"", protein:"", carbs:"", fat:"", fiber:"", portion:"", ingredients:"", recipe:"", youtube:"" }); setImportMode(null); };
  const startEdit = fd => { setPhotoPreview(fd.photo_url||null); setForm({ ...fd, name_hi:fd.name_hi||"", categories:Array.isArray(fd.categories)?fd.categories:[fd.category].filter(Boolean), ingredients:(fd.ingredients||[]).join("\n") }); setImportMode(null); };
  const toggleCat = c => setForm(p => { const cats=p.categories||[]; return { ...p, categories: cats.includes(c)?cats.filter(x=>x!==c):[...cats,c] }; });

  const handlePhoto = e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2*1024*1024) { showToast("Image must be under 2MB","error"); return; }
    const reader = new FileReader();
    reader.onload = ev => { setPhotoPreview(ev.target.result); setForm(p=>({...p,photo_url:ev.target.result})); };
    reader.readAsDataURL(file);
  };
  const removePhoto = () => { setPhotoPreview(null); setForm(p=>({...p,photo_url:""})); if(fileRef.current) fileRef.current.value=""; };

  const save = async () => {
    if (!form.name) { showToast("Name is required","error"); return; }
    if (!form.categories?.length) { showToast("Select at least one category","error"); return; }
    setBusy(true);
    try {
      const payload = { ...form, category:form.categories[0], calories:+form.calories||0, protein:+form.protein||0, carbs:+form.carbs||0, fat:+form.fat||0, fiber:+form.fiber||0, ingredients:(form.ingredients||"").split("\n").filter(Boolean), photo_url:form.photo_url||null, name_hi:form.name_hi||null };
      if (form.id) {
        await sbPatch("foods",`id=eq.${form.id}`,payload);
        setFoods(p=>p.map(f=>f.id===form.id?{...f,...payload}:f));
        showToast("Updated!");
      } else {
        const [saved] = await sbPost("foods",[payload]);
        setFoods(p=>[...p,saved]);
        showToast(`${saved.name} added!`);
      }
      setForm(null); setPhotoPreview(null);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const del = async fd => {
    if (!window.confirm(`Remove "${fd.name}"?`)) return;
    try { await sbDel("foods",`id=eq.${fd.id}`); setFoods(p=>p.filter(f=>f.id!==fd.id)); showToast("Removed","info"); }
    catch(e) { showToast(e.message,"error"); }
  };

  const runAiImport = async () => {
    if (!aiInput.trim()) { showToast("Enter at least one dish name","error"); return; }
    setAiBusy(true); setAiPreview([]);
    try {
      const dishes = aiInput.split("\n").map(s=>s.trim()).filter(Boolean);
      const res = await fetch(`${SB_URL}/functions/v1/ai-recipe-proxy`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${SB_KEY}`, "apikey":SB_KEY },
        body: JSON.stringify({ dishes }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Edge function error");
      setAiPreview(data.recipes);
      showToast(`${data.recipes.length} recipes generated! Review and save.`);
    } catch(e) { showToast("AI generation failed: " + e.message,"error"); }
    setAiBusy(false);
  };

  const saveAiItems = async (items) => {
    setBusy(true);
    try {
      const saved = await sbPost("foods", items);
      setFoods(p=>[...p,...(saved||items)]);
      showToast(`${items.length} recipes added! 🎉`);
      setImportMode(null); setAiInput(""); setAiPreview([]);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const removeAiPreview = idx => setAiPreview(p=>p.filter((_,i)=>i!==idx));

  const handleCsv = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const lines = ev.target.result.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/"/g,""));
        const rows = lines.slice(1).map(line => {
          const vals = line.split(",").map(v=>v.trim().replace(/^"|"$/g,""));
          const obj = {};
          headers.forEach((h,i) => obj[h] = vals[i]||"");
          return {
            name:obj.name||"", category:obj.category||"Lunch",
            categories:obj.categories ? obj.categories.split("|").map(s=>s.trim()) : [obj.category||"Lunch"],
            emoji:obj.emoji||"🍽️", calories:+obj.calories||0, protein:+obj.protein||0,
            carbs:+obj.carbs||0, fat:+obj.fat||0, fiber:+obj.fiber||0,
            portion:obj.portion||"", ingredients:obj.ingredients?obj.ingredients.split("|").map(s=>s.trim()):[],
            recipe:obj.recipe||"", youtube:obj.youtube||""
          };
        }).filter(r=>r.name);
        if (!rows.length) { showToast("No valid rows found in CSV","error"); return; }
        setBusy(true);
        const saved = await sbPost("foods", rows);
        setFoods(p=>[...p,...(saved||rows)]);
        showToast(`${rows.length} items imported! 🎉`);
        setImportMode(null); setBusy(false);
      } catch(e) { showToast("CSV error: "+e.message,"error"); setBusy(false); }
    };
    reader.readAsText(file);
    if(csvRef.current) csvRef.current.value="";
  };

  const COLS = [
    ["name","Text","Required","The dish name — e.g. Butter Chicken"],
    ["category","Text","Required","Primary meal slot: Breakfast, Lunch, Evening Snack, Dinner, Dessert, Drinks, Salad, Soup, Street Food, Side Dish"],
    ["categories","Text","Optional","All applicable slots separated by | — e.g. Breakfast|Evening Snack"],
    ["emoji","Emoji","Optional","A single emoji for the dish — e.g. 🍛"],
    ["calories","Number","Optional","Kilocalories per portion — e.g. 350"],
    ["protein","Number","Optional","Protein in grams — e.g. 12"],
    ["carbs","Number","Optional","Carbohydrates in grams — e.g. 45"],
    ["fat","Number","Optional","Fat in grams — e.g. 8"],
    ["fiber","Number","Optional","Dietary fiber in grams — e.g. 4"],
    ["portion","Text","Optional","Serving size — e.g. 1 bowl (200g)"],
    ["ingredients","Text","Optional","Ingredients separated by | — e.g. Rice 1 cup|Onion 1|Salt"],
    ["recipe","Text","Optional","Step-by-step cooking instructions"],
    ["youtube","URL","Optional","YouTube search or video URL"],
  ];

  const TIPS = [
    ["Use | not comma","Separate multiple categories and ingredients with a pipe | character, not a comma — commas separate columns."],
    ["Wrap commas in quotes","If recipe steps contain commas, wrap that cell in double quotes."],
    ["Save as .csv","In Excel: File > Save As > CSV. In Google Sheets: File > Download > CSV."],
    ["Column names are exact","Copy the header row exactly — names are case-sensitive."],
    ["Missing fields are OK","Only name and category are required. Leave others blank and edit later."],
  ];

  return (
    <div>
      {form ? (
        <div>
          <button className="btn btn-g btn-sm" onClick={()=>{setForm(null);setPhotoPreview(null);}} style={{ marginBottom:16 }}>Cancel</button>
          <div className="card">
            <h3 className="serif" style={{ fontSize:20, marginBottom:18 }}>{form.id?"Edit":"Add New"} Food Item</h3>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:8 }}>Food Photo (optional, max 2MB)</label>
              <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
                <div style={{ width:100, height:100, borderRadius:12, border:"2px dashed #ddd", overflow:"hidden", flexShrink:0, background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {photoPreview ? <img src={photoPreview} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <div style={{ textAlign:"center" }}><div style={{ fontSize:36 }}>{form.emoji||"🍽️"}</div><div style={{ fontSize:10, color:"#ccc", marginTop:4 }}>No photo</div></div>}
                </div>
                <div style={{ flex:1 }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display:"none" }} id="photoUpload" />
                  <label htmlFor="photoUpload" style={{ display:"inline-block", background:"#F4A200", color:"#fff", padding:"8px 16px", borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer", marginBottom:8 }}>
                    {photoPreview ? "Change Photo" : "Upload Photo"}
                  </label>
                  {photoPreview && <button onClick={removePhoto} className="btn btn-danger btn-sm" style={{ display:"block", marginTop:6 }}>Remove</button>}
                </div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[["name",t.foodName,""],["name_hi",t.foodNameHi,""],["emoji",t.emoji,"🍚"],["portion",t.portionSize,"1 bowl (150g)"],["calories",t.calories,"250"],["protein",t.protein,"6"],["carbs",t.carbs,"45"],["fat",t.fat,"5"],["fiber",t.fiber,"3"]].map(([k,l,ph])=>(
                <div key={k}><label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{l}</label><input className="input" value={form[k]||""} onChange={fv(k)} placeholder={ph} /></div>
              ))}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:8 }}>Categories * (select all that apply)</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {[...MEALS,...EXTRA_CATS].map(m => {
                  const sel=(form.categories||[]).includes(m);
                  return <button key={m} type="button" onClick={()=>toggleCat(m)} style={{ padding:"7px 14px", borderRadius:20, border:`2px solid ${sel?"#F4A200":"#ddd"}`, background:sel?"#FFF8E1":"#fff", color:sel?"#a87800":"#888", fontWeight:sel?700:400, fontSize:13, cursor:"pointer" }}>{sel?"✓ ":""}{m}</button>;
                })}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>YouTube URL</label>
              <input className="input" value={form.youtube||""} onChange={fv("youtube")} placeholder="https://www.youtube.com/results?search_query=..." />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Ingredients (one per line)</label>
              <textarea className="input" value={form.ingredients||""} onChange={fv("ingredients")} rows={6} style={{ resize:"vertical" }} placeholder={"Flattened rice 1 cup\nOnion 1 medium\nOil 1 tbsp"} />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Recipe Instructions</label>
              <textarea className="input" value={form.recipe||""} onChange={fv("recipe")} rows={5} style={{ resize:"vertical" }} />
            </div>
            <button className="btn btn-p" onClick={save} disabled={busy} style={{ width:"100%", padding:13, fontSize:15 }}>
              {busy ? t.saving : "Save to Database"}
            </button>
          </div>
        </div>
      ) : importMode==="ai" ? (
        <div>
          <button className="btn btn-g btn-sm" onClick={()=>{ setImportMode(null); setAiPreview([]); setAiInput(""); }} style={{ marginBottom:16 }}>Back to Database</button>
          <div className="card" style={{ marginBottom:16 }}>
            <h3 className="serif" style={{ fontSize:20, marginBottom:6 }}>AI Recipe Generator</h3>
            <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>Type dish names one per line. Claude will generate full recipes, nutrition info and ingredients for all of them at once.</p>
            <textarea className="input" value={aiInput} onChange={e=>setAiInput(e.target.value)} rows={8} style={{ resize:"vertical", marginBottom:14 }} placeholder={"Masala Dosa\nPav Bhaji\nGulab Jamun\nMango Lassi\nAloo Tikki"} />
            <button className="btn btn-p" onClick={runAiImport} disabled={aiBusy} style={{ width:"100%", padding:12, fontSize:15 }}>
              {aiBusy ? "Generating recipes... (15-20 sec)" : "Generate Recipes"}
            </button>
            {aiBusy && <div style={{ textAlign:"center", marginTop:16 }}><div className="spinner" /><p style={{ color:"#aaa", fontSize:12, marginTop:8 }}>Claude is crafting recipes and nutrition data...</p></div>}
          </div>
          {aiPreview.length>0 && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div><h3 className="serif" style={{ fontSize:18 }}>Preview — {aiPreview.length} recipes</h3><p style={{ fontSize:12, color:"#888" }}>Remove any you don't want then save all</p></div>
                <button className="btn btn-p" onClick={()=>saveAiItems(aiPreview)} disabled={busy} style={{ padding:"10px 20px" }}>{busy?t.saving:"Save All"}</button>
              </div>
              <div style={{ display:"grid", gap:12 }}>
                {aiPreview.map((food,i)=>(
                  <div key={i} className="card" style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                    <div style={{ fontSize:40, flexShrink:0 }}>{food.emoji}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{food.name}</div>
                      <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{food.portion} · {(food.categories||[food.category]).join(", ")}</div>
                      <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
                        {[["⚡",food.calories,"kcal","#a87800"],["🥩",food.protein+"g","protein","#2D6A4F"],["🌾",food.carbs+"g","carbs","#6B5CE7"],["🧈",food.fat+"g","fat","#C1440E"]].map(([ic,v,l,c])=>(
                          <span key={l} style={{ fontSize:12, color:c }}><b>{v}</b> {l}</span>
                        ))}
                      </div>
                      <div style={{ fontSize:12, color:"#aaa", marginTop:6 }}>{(food.ingredients||[]).slice(0,4).join(" · ")}{food.ingredients?.length>4?` +${food.ingredients.length-4} more`:""}</div>
                    </div>
                    <button onClick={()=>removeAiPreview(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffaaaa", fontSize:20 }}>x</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-p" onClick={()=>saveAiItems(aiPreview)} disabled={busy} style={{ width:"100%", padding:13, marginTop:16, fontSize:15 }}>{busy?t.saving:"Save All to Database"}</button>
            </div>
          )}
        </div>
      ) : importMode==="csv" ? (
        <div>
          <button className="btn btn-g btn-sm" onClick={()=>setImportMode(null)} style={{ marginBottom:16 }}>Back to Database</button>
          <div className="card" style={{ marginBottom:16 }}>
            <h3 className="serif" style={{ fontSize:20, marginBottom:6 }}>CSV Import</h3>
            <p style={{ fontSize:13, color:"#888" }}>Import many recipes at once from a spreadsheet. Create your CSV in Excel or Google Sheets then upload here.</p>
          </div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"#1A1A2E" }}>Column Reference</div>
            <div style={{ display:"grid", gap:0 }}>
              {COLS.map(([field,type,req,desc],i)=>(
                <div key={field} style={{ display:"grid", gridTemplateColumns:"120px 70px 75px 1fr", gap:8, padding:"8px 0", borderBottom:i<COLS.length-1?"1px solid #f5f0e8":"none", alignItems:"start" }}>
                  <code style={{ fontFamily:"monospace", fontWeight:700, color:"#C1440E", fontSize:13 }}>{field}</code>
                  <span style={{ fontSize:11, color:"#aaa", paddingTop:2 }}>{type}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:req==="Required"?"#C1440E":"#2D6A4F", paddingTop:2 }}>{req}</span>
                  <span style={{ fontSize:12, color:"#555", lineHeight:1.5 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Example CSV</div>
            <p style={{ fontSize:12, color:"#888", marginBottom:10 }}>Copy this header row exactly, then add one dish per row below:</p>
            <div style={{ background:"#1A1A2E", borderRadius:10, padding:14, overflowX:"auto" }}>
              <div style={{ fontSize:11, color:"#a8e6cf", lineHeight:1.8, fontFamily:"monospace", whiteSpace:"nowrap" }}>name,category,categories,emoji,calories,protein,carbs,fat,fiber,portion,ingredients,recipe,youtube</div>
              <div style={{ fontSize:11, color:"#ffd3a5", lineHeight:1.8, fontFamily:"monospace", whiteSpace:"nowrap", marginTop:4 }}>Poha,Breakfast,Breakfast|Evening Snack,,250,6,45,5,3,1 bowl (150g),Rice flakes 1 cup|Onion 1|Salt,Wash flakes. Saute onion. Add flakes cook 3 min.,https://youtube.com/results?search_query=poha</div>
              <div style={{ fontSize:11, color:"#ffd3a5", lineHeight:1.8, fontFamily:"monospace", whiteSpace:"nowrap", marginTop:4 }}>Rajma,Lunch,Lunch|Dinner,,420,18,65,7,14,1 bowl (250g),Kidney beans 1 cup|Onion 2|Tomato 3,Pressure cook rajma. Make gravy. Simmer 15 min.,https://youtube.com/results?search_query=rajma</div>
            </div>
          </div>
          <div className="card" style={{ marginBottom:16, background:"#fffdf7", border:"1px solid #f0e8d8" }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10, color:"#a87800" }}>Tips for best results</div>
            <div style={{ display:"grid", gap:10 }}>
              {TIPS.map(([tip,detail])=>(
                <div key={tip} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{ color:"#F4A200", fontSize:16, flexShrink:0 }}>›</span>
                  <div><div style={{ fontWeight:600, fontSize:13, color:"#555" }}>{tip}</div><div style={{ fontSize:12, color:"#888", marginTop:2 }}>{detail}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Upload Your CSV</div>
            <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCsv} style={{ display:"none" }} id="csvUpload" />
            <label htmlFor="csvUpload" style={{ display:"block", background:busy?"#ccc":"#F4A200", color:"#fff", padding:"14px", borderRadius:12, fontWeight:700, fontSize:16, cursor:busy?"not-allowed":"pointer", textAlign:"center" }}>
              {busy ? "Importing — please wait..." : "Choose CSV File to Import"}
            </label>
            <p style={{ fontSize:12, color:"#aaa", marginTop:10, textAlign:"center" }}>All rows with a valid name will be imported. You can edit or delete items after import.</p>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div>
              <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.foodDatabaseTitle}</h2>
              <p style={{ color:"#999", fontSize:13 }}>{foods.length} items total</p>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
              <button className="btn btn-g btn-sm" onClick={()=>setImportMode("csv")} style={{ fontSize:12 }}>CSV Import</button>
              <button className="btn btn-g btn-sm" onClick={()=>setImportMode("ai")} style={{ fontSize:12, borderColor:"#F4A200", color:"#F4A200" }}>AI Import</button>
              <button className="btn btn-p btn-sm" onClick={startAdd}>+ Add Item</button>
            </div>
          </div>
          <div style={{ position:"relative", marginBottom:14 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, color:"#bbb" }}>🔍</span>
            <input ref={searchRef} className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search food items..." style={{ paddingLeft:38, paddingRight:search?36:14 }} />
            {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#bbb", fontSize:18 }}>x</button>}
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {ALL_CATS.map(c=>(
              <button key={c} className="chip" onClick={()=>setCat(c)} style={{ background:cat===c?"#F4A200":"#f0e8d8", color:cat===c?"#fff":"#888", fontWeight:cat===c?700:400 }}>{c}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))", gap:13 }}>
            {filtered.map(food=>(
              <div key={food.id||food.name} className="food-card" style={{ position:"relative" }}>
                <button onClick={e=>{e.stopPropagation();toggleFav(food.id);}} style={{ position:"absolute", top:6, right:6, background:"rgba(255,255,255,.85)", border:"none", cursor:"pointer", fontSize:15, borderRadius:"50%", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2 }}>
                  {favs[food.id]?"❤️":"🤍"}
                </button>
                {(usageCnt[food.name]||0)>0 && <div style={{ position:"absolute", top:6, left:6, background:"#2D6A4F", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:10, zIndex:2 }}>x{usageCnt[food.name]}</div>}
                <div style={{ width:"100%", height:100, borderRadius:10, overflow:"hidden", marginBottom:8, background:"#f9f9f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <FoodImage food={food} size={80} radius={0} />
                </div>
                <div style={{ fontWeight:600, textAlign:"center", fontSize:14, marginBottom:3 }}>{(lang==="hi"&&food.name_hi)||food.name}</div>
                <div style={{ fontSize:10, color:"#aaa", textAlign:"center", marginBottom:5, display:"flex", flexWrap:"wrap", gap:3, justifyContent:"center" }}>
                  {foodCats(food).map(c=><span key={c} style={{ background:"#f5f0e8", borderRadius:10, padding:"1px 6px" }}>{c}</span>)}
                </div>
                <div style={{ fontSize:11, color:"#aaa", textAlign:"center", marginBottom:8 }}>{food.portion}</div>
                <div style={{ display:"flex", justifyContent:"space-around", marginBottom:10, fontSize:12 }}>
                  <span style={{ color:"#a87800" }}><b>{food.calories}</b> kcal</span>
                  <span style={{ color:"#2D6A4F" }}><b>{food.protein}g</b> pro</span>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button className="btn btn-g btn-sm" onClick={()=>startEdit(food)} style={{ flex:1 }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={()=>del(food)} style={{ flex:0.6 }}>Del</button>
                </div>
              </div>
            ))}
            {filtered.length===0 && (
              <div style={{ gridColumn:"1/-1", textAlign:"center", padding:50, color:"#ccc" }}>
                <div style={{ fontSize:40 }}>🔍</div>
                <div style={{ marginTop:10 }}>{search ? `No results for "${search}"` : "No items in this category"}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── FINALIZE ─────────────────────────────────────────────────────────────────
function FinalizeView({ days, meals, planner, onToggle, onGenShopping, MICONS, MCOLS }) {
  const t = useT();
  const approved = planner.filter(p=>p.finalized).length;

  const printMenu = () => {
    const finalItems = planner.filter(p=>p.finalized);

    // Build table rows — one per day
    const rows = days.map(day => {
      const cols = meals.map(meal => {
        const items = finalItems.filter(p=>p.day===day && p.meal===meal);
        if (!items.length) return `<td style="color:#bbb;font-style:italic;padding:10px 12px;border:1px solid #e0e0e0;vertical-align:top;">—</td>`;
        const names = [...new Set(items.map(i=>i.food_name))].join("<br/>");
        return `<td style="padding:10px 12px;border:1px solid #e0e0e0;vertical-align:top;font-size:13px;">${names}</td>`;
      }).join("");
      const isToday = day === new Date().toLocaleDateString("en",{weekday:"long"});
      return `<tr style="background:${isToday?"#fff8e1":"#fff"};">
        <td style="padding:10px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;white-space:nowrap;background:${isToday?"#F4A200":"#f5f5f5"};color:${isToday?"#fff":"#333"};">${day}${isToday?" ★":""}</td>
        ${cols}
      </tr>`;
    }).join("");

    const mealHeaders = meals.map(m =>
      `<th style="padding:10px 12px;border:1px solid #e0e0e0;background:#2D6A4F;color:#fff;font-size:13px;white-space:nowrap;">${m}</th>`
    ).join("");

    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html>
<html><head><title>Family Kitchen — Weekly Menu</title>
<style>
  @page { size:A4 landscape; margin:15mm; }
  body { font-family:Arial,sans-serif; color:#1A1A2E; }
  h1 { font-size:22px; margin-bottom:4px; color:#2D6A4F; }
  p  { font-size:12px; color:#888; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; page-break-inside:avoid; }
  th,td { text-align:left; }
  .footer { margin-top:20px; font-size:11px; color:#aaa; text-align:center; }
  @media print { button { display:none; } body { margin:0; } }
</style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
    <div>
      <h1>👨‍👩‍👧‍👦 Family Kitchen — Weekly Menu</h1>
      <p>Generated on ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})} · ${approved} items approved</p>
    </div>
    <button onclick="window.print()" style="background:#F4A200;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;">🖨️ Print</button>
  </div>
  <table>
    <thead>
      <tr>
        <th style="padding:10px 12px;border:1px solid #e0e0e0;background:#1A1A2E;color:#fff;font-size:13px;">Day</th>
        ${mealHeaders}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Family Kitchen · Designed by Revive Healthcare · ${new Date().getFullYear()}</div>
</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(), 500);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>Finalize Menu</h2>
          <p style={{ color:"#999", fontSize:13 }}>Approve items for the week — only approved items go to the shopping list</p>
        </div>
        <button
          onClick={printMenu}
          disabled={approved===0}
          style={{ background: approved>0?"#1A1A2E":"#ccc", color:"#fff", border:"none", padding:"9px 16px", borderRadius:10, fontWeight:700, fontSize:13, cursor:approved>0?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", gap:6 }}>
          🖨️ Print Menu
        </button>
      </div>
      {days.map(day=>{
        const dayItems = planner.filter(p=>p.day===day);
        if (!dayItems.length) return null;
        return (
          <div key={day} className="card" style={{ marginBottom:14 }}>
            <div className="serif" style={{ fontSize:16, fontWeight:700, marginBottom:12, color:"#1A1A2E", paddingBottom:8, borderBottom:"1px solid #f0e8d8" }}>{day}</div>
            {meals.map(meal=>{
              const items = dayItems.filter(p=>p.meal===meal);
              if (!items.length) return null;
              return (
                <div key={meal} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#aaa", marginBottom:6 }}>{MICONS[meal]} {meal}</div>
                  {items.map((item,i)=>(
                    <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:item.finalized?"#e8f5e9":"#f9f9f9", borderRadius:9, marginBottom:4, border:`1px solid ${item.finalized?"#c8e6c9":"#eee"}`, transition:"all .18s" }}>
                      <span style={{ fontSize:13 }}>{item.food_emoji} {item.food_name} <span style={{ color:"#bbb", fontSize:11 }}>— {item.member_name}</span></span>
                      <button onClick={()=>onToggle(item.id,item.finalized)} style={{ background:item.finalized?"#2D6A4F":"#fff", color:item.finalized?"#fff":"#888", border:`1px solid ${item.finalized?"#2D6A4F":"#ddd"}`, padding:"4px 12px", borderRadius:7, fontSize:12, cursor:"pointer", fontWeight:600, transition:"all .18s" }}>
                        {item.finalized?`✓ ${t.approved}`:t.approve}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
      {planner.length===0 && <div style={{ textAlign:"center", padding:60, color:"#ccc" }}><div style={{ fontSize:48 }}>📋</div><div style={{ marginTop:12 }}>No meals planned yet</div></div>}
      <div style={{ position:"sticky", bottom:20, background:"#fff8f0", borderRadius:14, padding:14, border:"1px solid #ede5d8", marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13, color:"#888" }}>{approved} items approved</div>
        <button className="btn btn-p" onClick={onGenShopping} disabled={approved===0} style={{ padding:"10px 22px" }}>🛒 Generate Shopping List →</button>
      </div>
    </div>
  );
}

// ─── SHOPPING ─────────────────────────────────────────────────────────────────
function ShoppingView({ genList, planner, SAPPS, showToast, isHead }) {
  const t = useT();
  const [list,     setList]    = useState(null);
  const [selApp,   setSelApp]  = useState(null);
  const [tab,      setTab]     = useState("list"); // "list" | "shop"

  useEffect(() => { if (list===null) setList(genList()); }, []);

  const toggle  = idx => setList(p => p.map((i,j) => j===idx ? {...i, checked:!i.checked} : i));
  const remove  = idx => setList(p => p.filter((_,j) => j!==idx));
  const addRow  = ()  => setList(p => [...p, { name:"", days:[], checked:false }]);
  const upd     = (idx,v) => setList(p => p.map((i,j) => j===idx ? {...i, name:v} : i));
  const regen   = ()  => { setList(genList()); showToast("Shopping list regenerated!"); };

  const checkedCount   = (list||[]).filter(i=>i.checked).length;
  const uncheckedItems = (list||[]).filter(i=>!i.checked);

  // ── EXPORT as text ──────────────────────────────────────────────────────────
  const exportList = () => {
    if (!list?.length) { showToast("Nothing to export","error"); return; }
    const lines = [
      "🛒 FAMILY KITCHEN — SHOPPING LIST",
      "─────────────────────────────────",
      `Generated: ${new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}`,
      "",
      "ITEMS TO BUY:",
      ...uncheckedItems.map((i,n) => `  ${n+1}. ${i.name}`),
      "",
      checkedCount > 0 ? "ALREADY HAVE:" : "",
      ...(checkedCount > 0 ? (list||[]).filter(i=>i.checked).map(i => `  ✓ ${i.name}`) : []),
      "",
      `Total: ${uncheckedItems.length} items remaining`,
    ].filter(l => l !== undefined).join("\n");

    // Try native share API first (mobile)
    if (navigator.share) {
      navigator.share({ title:"Family Kitchen Shopping List", text:lines })
        .then(() => showToast("Shared successfully!"))
        .catch(() => fallbackExport(lines));
    } else {
      fallbackExport(lines);
    }
  };

  const fallbackExport = (text) => {
    // Download as .txt file
    const blob = new Blob([text], { type:"text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `shopping-list-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Shopping list downloaded!");
  };

  const printList = () => {
    const lines = (list||[]).map((i,n) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${n+1}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #eee;">${i.name}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.checked?"✓":""}</td></tr>`
    ).join("");
    const w = window.open("","_blank");
    w.document.write(`<html><head><title>Shopping List</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;max-width:600px;margin:0 auto;}
      h2{color:#2D6A4F;}table{width:100%;border-collapse:collapse;}
      th{background:#F4A200;color:#fff;padding:10px 12px;text-align:left;}
      @media print{button{display:none;}}</style></head>
      <body>
        <h2>🛒 Family Kitchen — Shopping List</h2>
        <p style="color:#888">Generated: ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</p>
        <button onclick="window.print()" style="background:#F4A200;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;margin-bottom:16px;">🖨️ Print</button>
        <table><thead><tr><th>#</th><th>Item</th><th>Have?</th></tr></thead><tbody>${lines}</tbody></table>
        <p style="margin-top:20px;color:#aaa;font-size:12px">Family Kitchen · Designed by Revive Healthcare</p>
      </body></html>`);
    w.document.close();
  };

  // ── ONLINE SHOPPING VIEW ───────────────────────────────────────────────────
  if (selApp) return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button className="btn btn-g btn-sm" onClick={()=>{ setSelApp(null); setTab("list"); }}>← Back</button>
        <div>
          <h2 className="serif" style={{ fontSize:20, color:"#1A1A2E" }}>{selApp.logo} {selApp.name}</h2>
          <p style={{ fontSize:12, color:"#999" }}>{uncheckedItems.length} items to shop</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="card" style={{ marginBottom:16, background:"#fffdf7" }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:8 }}>
          <span style={{ fontWeight:600, color:"#2D6A4F" }}>✓ {checkedCount} added to cart</span>
          <span style={{ color:"#aaa" }}>{uncheckedItems.length} remaining</span>
        </div>
        <div style={{ background:"#f0f0f0", borderRadius:20, height:8 }}>
          <div style={{ width:`${list?.length ? (checkedCount/list.length)*100 : 0}%`, background:"#2D6A4F", borderRadius:20, height:"100%", transition:"width .3s" }} />
        </div>
      </div>

      {/* All items with search buttons */}
      <div style={{ display:"grid", gap:10 }}>
        {(list||[]).map((item, idx) => (
          <div key={idx} className="card" style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:item.checked?"#f0fdf4":"#fff", border:item.checked?"1px solid #bbf7d0":"1px solid #ede5d8", transition:"all .2s" }}>
            {/* Checkbox */}
            <input type="checkbox" checked={item.checked} onChange={()=>toggle(idx)}
              style={{ width:20, height:20, cursor:"pointer", accentColor:"#2D6A4F", flexShrink:0 }} />

            {/* Item name */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:500, color:item.checked?"#86efac":"#1A1A2E", textDecoration:item.checked?"line-through":"none" }}>{item.name}</div>
              {item.days?.length>0 && <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>Used in: {item.days.slice(0,2).join(", ")}</div>}
            </div>

            {/* Search button */}
            {!item.checked && (
              <a href={`${selApp.url}${encodeURIComponent(item.name.split(" ").slice(0,4).join(" "))}`}
                target="_blank" rel="noreferrer"
                onClick={()=>toggle(idx)}
                style={{ background:selApp.color, color:selApp.color==="#F5C518"?"#1A1A2E":"#fff", padding:"7px 14px", borderRadius:9, textDecoration:"none", fontWeight:700, fontSize:12, flexShrink:0, whiteSpace:"nowrap" }}>
                🔍 Search
              </a>
            )}
            {item.checked && (
              <span style={{ color:"#2D6A4F", fontWeight:700, fontSize:18, flexShrink:0 }}>✓</span>
            )}
          </div>
        ))}
      </div>

      {uncheckedItems.length === 0 && (
        <div style={{ textAlign:"center", padding:40, marginTop:16 }}>
          <div style={{ fontSize:52 }}>🎉</div>
          <h3 className="serif" style={{ fontSize:22, marginTop:12 }}>All done!</h3>
          <p style={{ color:"#999", fontSize:13, marginTop:8 }}>All items have been added to your {selApp.name} cart</p>
          <button className="btn btn-p" onClick={()=>{ setSelApp(null); setTab("list"); }} style={{ marginTop:16 }}>← Back to List</button>
        </div>
      )}
    </div>
  );

  // ── MAIN SHOPPING LIST ─────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.shoppingList}</h2>
          <p style={{ color:"#999", fontSize:13 }}>{uncheckedItems.length} items remaining · {checkedCount} have</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <button className="btn btn-g btn-sm" onClick={addRow}>+ Add</button>
          {isHead && <button className="btn btn-g btn-sm" onClick={regen}>↻ Refresh</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", background:"#f5f0e8", borderRadius:10, padding:4, marginBottom:16, gap:2 }}>
        {[["list",t.listTab],["shop",t.orderOnlineTab]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px 4px", borderRadius:8, border:"none", background:tab===t?"#fff":"transparent", fontWeight:tab===t?700:400, fontSize:13, cursor:"pointer", color:tab===t?"#1A1A2E":"#999", boxShadow:tab===t?"0 1px 5px rgba(0,0,0,.08)":"none", transition:"all .18s" }}>{l}</button>
        ))}
      </div>

      {list===null || list.length===0 ? (
        <div style={{ textAlign:"center", padding:60, background:"#fff", borderRadius:16, border:"1px solid #ede5d8" }}>
          <div style={{ fontSize:56 }}>🛒</div>
          <h3 className="serif" style={{ fontSize:20, marginTop:14 }}>No shopping list yet</h3>
          <p style={{ color:"#999", marginTop:8, fontSize:13 }}>The Kitchen Head must finalize the menu first</p>
        </div>
      ) : tab==="list" ? (
        <div>
          {/* Export / Print actions */}
          <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
            <button onClick={exportList} className="btn btn-g" style={{ fontSize:13, flex:1 }}>
              📤 Share / Save
            </button>
            <button onClick={printList} className="btn btn-g" style={{ fontSize:13, flex:1 }}>
              🖨️ Print
            </button>
          </div>

          {/* List */}
          <div className="card" style={{ marginBottom:16 }}>
            {list.map((item,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<list.length-1?"1px solid #f5f0e8":"none" }}>
                <input type="checkbox" checked={item.checked} onChange={()=>toggle(i)} style={{ width:18, height:18, cursor:"pointer", accentColor:"#2D6A4F" }} />
                <input value={item.name} onChange={e=>upd(i,e.target.value)}
                  style={{ flex:1, border:"none", fontSize:14, color:item.checked?"#ccc":"#1A1A2E", textDecoration:item.checked?"line-through":"none", outline:"none", background:"transparent" }} />
                {item.days?.length>0 && <span style={{ fontSize:10, color:"#ddd", whiteSpace:"nowrap" }}>{item.days[0]}</span>}
                <button onClick={()=>remove(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ffbbbb", fontSize:18, padding:"0 3px" }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#888", padding:"4px 0" }}>
            <span>{uncheckedItems.length} items to buy</span>
            <span>{checkedCount} already have</span>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>Choose a delivery app. You'll see all items with a search button against each one — shop in any order.</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:12 }}>
            {SAPPS.map(app=>(
              <button key={app.name} onClick={()=>setSelApp(app)}
                style={{ background:"#fff", border:`2px solid ${app.color}`, borderRadius:14, padding:"14px 10px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}
                onMouseEnter={e=>e.currentTarget.style.background=`${app.color}22`}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <div style={{ fontSize:30 }}>{app.logo}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#1A1A2E", marginTop:6 }}>{app.name}</div>
                <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>{uncheckedItems.length} items</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── FAMILY MANAGEMENT ────────────────────────────────────────────────────────
function FamilyView({ family, setFamily, members, setMembers, member, showToast, MCOLS, isHead }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [newM,   setNewM]   = useState({ name:"", email:"" });
  const [busy,   setBusy]   = useState(false);
  const [editFam,  setEditFam]  = useState(false);
  const [famName,  setFamName]  = useState(family?.name||"");
  const [showReset,    setShowReset]    = useState(false);
  const [frNewPw,      setFrNewPw]      = useState("");
  const [frConfirm,    setFrConfirm]    = useState("");
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [showInvitePop,setShowInvitePop]= useState(false);

  const addMember = async () => {
    if (!newM.name||!newM.email) { showToast("Name and email required","error"); return; }
    const em = newM.email.trim().toLowerCase();
    // Check if this email already has an active account in this family
    const existing = await sbGet("members",`email=eq.${encodeURIComponent(em)}&family_id=eq.${family.id}&select=id,auth_id`).catch(()=>[]);
    if (existing?.length && existing[0].auth_id) { showToast("This email is already a member","error"); return; }
    if (existing?.length && !existing[0].auth_id) { showToast("Invite already sent to this email","info"); return; }
    setBusy(true);
    try {
      // Save as pending invite (auth_id stays null until they register)
      const [saved] = await sbPost("members",[{ family_id:family.id, name:newM.name, username:newM.name, email:em, role:"member", auth_id:null }]);
      setMembers(p=>[...p,saved]);
      setNewM({ name:"", email:"" }); setAdding(false);
      showToast(`${newM.name} added! Share the invite link below with them. 📋`);
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const removeMember = async (m) => {
    if (m.id===member.id) { showToast("Can't remove yourself","error"); return; }
    if (!window.confirm(`Remove ${m.name}?`)) return;
    try { await sbDel("members",`id=eq.${m.id}`); setMembers(p=>p.filter(x=>x.id!==m.id)); showToast("Removed","info"); }
    catch(e) { showToast(e.message,"error"); }
  };

  const setHead = async (m) => {
    if (!isHead) return;
    try {
      await sbPatch("families",`id=eq.${family.id}`,{ head_id:m.id });
      setFamily(f=>({...f,head_id:m.id}));
      showToast(`${m.name} is now the Kitchen Head!`);
    } catch(e) { showToast(e.message,"error"); }
  };

  const renameFamily = async () => {
    try { await sbPatch("families",`id=eq.${family.id}`,{ name:famName }); setFamily(f=>({...f,name:famName})); setEditFam(false); showToast("Family name updated!"); }
    catch(e) { showToast(e.message,"error"); }
  };

  const resetFamilyPassword = async () => {
    if (frNewPw.length < 4)    { showToast("Password too short (min 4 characters)","error"); return; }
    if (frNewPw !== frConfirm) { showToast("Passwords do not match","error"); return; }
    setBusy(true);
    try {
      await sbPatch("families",`id=eq.${family.id}`,{ password:frNewPw });
      setFamily(f=>({...f, password:frNewPw}));
      showToast("Family password updated! Share the new password with your family. 🔑");
      setShowReset(false); setFrNewPw(""); setFrConfirm("");
    } catch(e) { showToast(e.message,"error"); }
    setBusy(false);
  };

  const renameMember = async (m, name) => {
    try { await sbPatch("members",`id=eq.${m.id}`,{ name, username:name }); setMembers(p=>p.map(x=>x.id===m.id?{...x,name,username:name}:x)); }
    catch(e) { /* silent */ }
  };

  const resendInvite = (m) => {
    if (!m.email) { showToast("No email address for this member","error"); return; }
    setInviteEmail(m.email);
    setShowInvitePop(true);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 className="serif" style={{ fontSize:22, color:"#1A1A2E" }}>{t.familyMembers}</h2>
          {editFam ? (
            <div style={{ display:"flex", gap:8, marginTop:6, alignItems:"center" }}>
              <input className="input" value={famName} onChange={e=>setFamName(e.target.value)} style={{ width:200 }} />
              <button className="btn btn-p btn-sm" onClick={renameFamily}>Save</button>
              <button className="btn btn-g btn-sm" onClick={()=>setEditFam(false)}>Cancel</button>
            </div>
          ) : (
            <p style={{ color:"#999", fontSize:13, cursor:"pointer" }} onClick={()=>isHead&&setEditFam(true)}>{family?.name} {isHead&&<span style={{ color:"#F4A200" }}>✏️</span>}</p>
          )}
        </div>
        {isHead && <button className="btn btn-p" onClick={()=>setAdding(true)}>+ Add Member</button>}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom:16, border:"1px solid #F4A200", background:"#fffdf7" }}>
          <h3 style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Invite Family Member</h3>
          <p style={{ fontSize:12, color:"#888", marginBottom:12 }}>Enter their name and email. They register with that email in the app and auto-join your family — no Family ID or password needed.</p>
          {/* Contact Picker — shown only if browser supports it (Android Chrome, iOS Safari 16+) */}
          {"contacts" in navigator && "ContactsManager" in window && (
            <div style={{ marginBottom:14 }}>
              <button
                className="btn btn-g"
                style={{ width:"100%", fontSize:13, padding:"10px", borderStyle:"dashed", borderColor:"#2D6A4F", color:"#2D6A4F", fontWeight:600 }}
                onClick={async () => {
                  try {
                    const contacts = await navigator.contacts.select(["name","email"], { multiple:false });
                    if (!contacts?.length) return;
                    const c  = contacts[0];
                    const nm = Array.isArray(c.name)  ? c.name[0]  : (c.name  || "");
                    const em = Array.isArray(c.email) ? c.email[0] : (c.email || "");
                    setNewM({ name:nm, email:em });
                  } catch(e) { showToast("Contact picker closed","info"); }
                }}>
                📱 Pick from Phone Contacts
              </button>
              <p style={{ fontSize:11, color:"#aaa", textAlign:"center", marginTop:5 }}>Or enter manually below</p>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }} className="grid-2">
            <div><label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Name</label><input className="input" value={newM.name} onChange={e=>setNewM(p=>({...p,name:e.target.value}))} placeholder="Member name" /></div>
            <div><label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>Email Address</label><input className="input" value={newM.email} onChange={e=>setNewM(p=>({...p,email:e.target.value}))} placeholder="member@email.com" type="email" /></div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="btn btn-p" onClick={addMember} disabled={busy}>{busy?"Sending...":"📧 Send Invite"}</button>
            <button className="btn btn-g" onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Invite instructions — shown when there are pending members */}
      {members.some(m=>!m.auth_id) && isHead && (
        <div className="card" style={{ marginBottom:4, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#2D6A4F", marginBottom:6 }}>📋 How pending members join:</div>
          <div style={{ fontSize:12, color:"#555", lineHeight:1.8 }}>
            1. Tap <b>📤 Share Invite</b> on their card below<br/>
            2. Send them the message via WhatsApp or any chat app<br/>
            3. They tap the link → popup opens automatically with their email pre-prompted<br/>
            4. They enter their email → receive joining link → set password → auto-joined! ✅
          </div>
        </div>
      )}

      {/* Inline invite popup for FamilyView */}
      <InvitePopup
        show={showInvitePop}
        initialEmail={inviteEmail}
        onClose={()=>{ setShowInvitePop(false); setInviteEmail(""); }}
        showToast={showToast}
      />

      <div style={{ display:"grid", gap:12 }}>
        {members.map((m,i)=>{
          const isThisHead = m.id===family?.head_id;
          return (
            <div key={m.id} className="card" style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:46, height:46, borderRadius:"50%", background:MCOLS[i%MCOLS.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff", flexShrink:0 }}>{(m.name||"?")[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <input defaultValue={m.name||m.username} onBlur={e=>e.target.value!==(m.name||m.username)&&renameMember(m,e.target.value)} style={{ border:"none", fontSize:15, fontWeight:600, color:"#1A1A2E", outline:"none", width:"100%", background:"transparent" }} readOnly={!isHead&&m.id!==member.id} />
                <div style={{ fontSize:12, color:"#999" }}>✉️ {m.email||"(no email)"}
                  {!m.auth_id && <span style={{ marginLeft:8, background:"#FFF3CD", color:"#856404", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20 }}>⏳ Invite Pending</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0, flexWrap:"wrap", justifyContent:"flex-end" }}>
                {isThisHead && <span className="badge" style={{ background:"#fff8e1", color:"#a87800" }}>★ Head</span>}
                {!isThisHead && isHead && <button className="btn btn-g btn-sm" onClick={()=>setHead(m)} style={{ fontSize:11 }}>Make Head</button>}
                {!m.auth_id && isHead && (
                  <div style={{ display:"flex", gap:6 }}>
                    <button
                      onClick={()=>resendInvite(m)}
                      style={{ background:"#e8f5e9", color:"#2D6A4F", border:"1px solid #c8e6c9", padding:"4px 10px", borderRadius:8, fontSize:11, cursor:"pointer", fontWeight:600 }}>
                      📧 Send Link
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Hi ${m.name}! You have been invited to join our Family Kitchen meal planner 👨‍👩‍👧‍👦

Tap this link to join:
https://family-kitchen-gamma-rust.vercel.app?invite=true

When it opens, enter this email: ${m.email}
Then tap "Send Joining Link" — done!

(Family: ${family.name})`)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background:"#25D366", color:"#fff", border:"none", padding:"4px 10px", borderRadius:8, fontSize:11, fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}>
                      💬 WhatsApp
                    </a>
                  </div>
                )}
                {m.id!==member.id && isHead && <button className="btn btn-danger btn-sm" onClick={()=>removeMember(m)}>Remove</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop:22, background:"#f9f5ff", border:"1px solid #e0d5ff" }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>🔗 Family ID &amp; Password</div>
        <div style={{ background:"#fff", borderRadius:9, padding:"10px 14px", fontFamily:"monospace", fontSize:13, color:"#6B5CE7", border:"1px solid #e0d5ff", wordBreak:"break-all", marginBottom:8 }}>
          Family ID: <b>{family?.id}</b>
        </div>
        <p style={{ fontSize:12, color:"#888", marginBottom:12 }}>
          Share this Family ID + family password with new members. They use "Join Family" on the login screen to join.
        </p>
        {isHead && (
          showReset ? (
            <div style={{ background:"#fff", borderRadius:10, padding:14, border:"1px solid #ddd", marginTop:4 }}>
              <div style={{ fontWeight:600, fontSize:13, color:"#1A1A2E", marginBottom:10 }}>🔑 Reset Family Password</div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>New Family Password</label>
                <PwInput value={frNewPw} onChange={e=>setFrNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5 }}>{t.confirmPassword}</label>
                <PwInput value={frConfirm} onChange={e=>setFrConfirm(e.target.value)} placeholder="Re-enter" autoComplete="new-password" />
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn btn-p" onClick={resetFamilyPassword} disabled={busy} style={{ flex:1 }}>
                  {busy?"Updating…":t.updatePassword}
                </button>
                <button className="btn btn-g" onClick={()=>{ setShowReset(false); setFrNewPw(""); setFrConfirm(""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>setShowReset(true)} className="btn btn-g" style={{ fontSize:12, width:"100%" }}>
              🔑 Reset Family Password
            </button>
          )
        )}
      </div>
    </div>
  );
}
