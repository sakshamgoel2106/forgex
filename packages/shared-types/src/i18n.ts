/**
 * ForgeX AI — Multi-Language Registry & Industrial Copilot Localization
 */

export type SupportedLanguageCode =
  | 'en-US'
  | 'hi-IN'
  | 'mr-IN'
  | 'gu-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'kn-IN'
  | 'bn-IN'
  | 'pa-IN'
  | 'es-ES'
  | 'de-DE'
  | 'ja-JP';

export interface SupportedLanguageConfig {
  code: SupportedLanguageCode;
  label: string;
  nativeLabel: string;
  name: string;
  bcp47: string;
  voiceHints: string[];
  missingRecordsMessage: string;
  insufficientEvidenceMessage: string;
  lotoHeader: string;
  lotoProtocolPrefix: string;
  lotoZeroEnergyRequirement: string;
  lotoProcedurePrefix: string;
  lotoDefaultAction: string;
  conflictHeader: string;
  conflictMessage: string;
  insufficientDocHeader: string;
  insufficientDocMessage: string;
  measurementNotice: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguageConfig[] = [
  {
    code: 'en-US',
    label: 'English (Technical)',
    nativeLabel: 'English',
    name: 'English',
    bcp47: 'en-US',
    voiceHints: ['Google US English', 'Microsoft Zira', 'Microsoft David', 'en-US', 'en-IN'],
    missingRecordsMessage:
      'The specific information requested is not available in the verified records for this machine.',
    insufficientEvidenceMessage:
      'Insufficient evidence in authorized plant documentation to answer this question safely. Please consult senior engineering or verify documentation access for your plant.',
    lotoHeader: 'MANDATORY OSHA / LOTO SAFETY DIRECTIVE & ISOLATION WARNING',
    lotoProtocolPrefix: 'MANDATORY LOCKOUT/TAGOUT PROTOCOL — HAZARD:',
    lotoZeroEnergyRequirement: 'Mandatory Zero Energy State verification required before physical contact.',
    lotoProcedurePrefix: 'Verified Isolation Procedure:',
    lotoDefaultAction:
      'Lockout/tagout primary energy feeder, de-energize electrical breakers, close suction/discharge isolation valves, and vent stored pressure.',
    conflictHeader: 'DOCUMENTATION DISCREPANCY / CONFLICT IDENTIFIED',
    conflictMessage:
      'Contradictory specifications or outdated service bulletins detected between indexed sources. Do not execute field adjustments without active engineering revision sign-off.',
    insufficientDocHeader: 'INSUFFICIENT PLANT DOCUMENTATION EVIDENCE',
    insufficientDocMessage:
      'ForgeX safety policy strictly forbids hallucinating operational limits or assuming equipment telemetry.',
    measurementNotice:
      'No verified sensor telemetry or calibrated gauge reading is available for this machine. ForgeX AI policy strictly forbids estimating or inventing values. Physical inspection with calibrated tools is required.',
  },
  {
    code: 'hi-IN',
    label: 'Hindi (हिंदी)',
    nativeLabel: 'हिंदी',
    name: 'Hindi',
    bcp47: 'hi-IN',
    voiceHints: ['Google हिन्दी', 'Microsoft Swara', 'Microsoft Madhur', 'hi-IN', 'hi_IN'],
    missingRecordsMessage:
      'इस मशीन के सत्यापित रिकॉर्ड में मांगी गई विशिष्ट जानकारी उपलब्ध नहीं है।',
    insufficientEvidenceMessage:
      'अधिकृत संयंत्र दस्तावेज़ों में इस प्रश्न का सुरक्षित उत्तर देने के लिए अपर्याप्त साक्ष्य हैं। कृपया वरिष्ठ इंजीनियरिंग से परामर्श करें या अपने संयंत्र के दस्तावेज़ एक्सेस की पुष्टि करें।',
    lotoHeader: 'अनिवार्य OSHA / LOTO सुरक्षा निर्देश और आइसोलेशन चेतावनी',
    lotoProtocolPrefix: 'अनिवार्य लॉकआउट/टैगआउट प्रोटोकॉल — खतरा:',
    lotoZeroEnergyRequirement: 'भौतिक संपर्क से पहले शून्य ऊर्जा स्थिति (Zero Energy State) का सत्यापन अनिवार्य है।',
    lotoProcedurePrefix: 'सत्यापित आइसोलेशन प्रक्रिया:',
    lotoDefaultAction:
      'प्राथमिक ऊर्जा फीडर को लॉकआउट/टैगआउट करें, विद्युत ब्रेकर्स को डी-एनर्जाइज करें, सक्शन/डिस्चार्ज आइसोलेशन वाल्व बंद करें और अवशिष्ट दबाव निकालें।',
    conflictHeader: 'दस्तावेज़ विसंगति / विरोध पहचाना गया',
    conflictMessage:
      'अनुक्रमित स्रोतों के बीच परस्पर विरोधी विनिर्देश या पुराने सेवा बुलेटिन पाए गए हैं। सक्रिय इंजीनियरिंग संशोधन अनुमोदन के बिना फ़ील्ड समायोजन न करें।',
    insufficientDocHeader: 'अपर्याप्त संयंत्र दस्तावेज़ीकरण साक्ष्य',
    insufficientDocMessage:
      'ForgeX सुरक्षा नीति परिचालन सीमाओं का अनुमान लगाने या उपकरण टेलीमेट्री को स्वतः मानने से सख्त मना करती है।',
    measurementNotice:
      'इस मशीन के लिए कोई सत्यापित सेंसर टेलीमेट्री या कैलिब्रेटेड गेज रीडिंग उपलब्ध नहीं है। कैलिब्रेटेड उपकरणों के साथ भौतिक निरीक्षण आवश्यक है।',
  },
  {
    code: 'mr-IN',
    label: 'Marathi (मराठी)',
    nativeLabel: 'मराठी',
    name: 'Marathi',
    bcp47: 'mr-IN',
    voiceHints: ['Google मराठी', 'Microsoft Aarohi', 'mr-IN', 'mr_IN'],
    missingRecordsMessage:
      'या मशीनच्या पडताळणी केलेल्या नोंदींमध्ये विनंती केलेली विशिष्ट माहिती उपलब्ध नाही.',
    insufficientEvidenceMessage:
      'अधिकृत प्लांट दस्तऐवजांमध्ये या प्रश्नाचे सुरक्षित उत्तर देण्यासाठी अपुरा पुरावा आहे. कृपया वरिष्ठ अभियंत्यांशी संपर्क साधा.',
    lotoHeader: 'अनिवार्य OSHA / LOTO सुरक्षा निर्देश आणि अलगीकरण चेतावणी',
    lotoProtocolPrefix: 'अनिवार्य लॉकआउट/टॅगआउट प्रोटोकॉल — धोका:',
    lotoZeroEnergyRequirement: 'प्रत्यक्ष संपर्कापूर्वी शून्य ऊर्जा स्थिती (Zero Energy State) पडताळणी अनिवार्य आहे.',
    lotoProcedurePrefix: 'पडताळलेली अलगीकरण प्रक्रिया:',
    lotoDefaultAction:
      'प्राथमिक ऊर्जा फीडर लॉकआउट/टॅगआउट करा, इलेक्ट्रिकल ब्रेकर्स बंद करा, सक्शन/डिस्चार्ज व्हॉल्व्ह बंद करा आणि साठलेला दाब काढून टाका.',
    conflictHeader: 'दस्तऐवज विसंगती आढळली',
    conflictMessage:
      'निर्देशांकित स्त्रोतांमध्ये परस्परविरोधी वैशिष्ट्ये आढळली आहेत. सक्रिय अभियांत्रिकी स्वाक्षरीशिवाय फील्ड बदल करू नका.',
    insufficientDocHeader: 'अपुरा प्लांट दस्तऐवज पुरावा',
    insufficientDocMessage:
      'ForgeX सुरक्षा धोरण ऑपरेटिंग मर्यादांचा अंदाज लावण्यास किंवा उपकरण टेलिमेट्री गृहीत धरण्यास सक्त मनाई करते.',
    measurementNotice:
      'या मशीनसाठी कोणतेही सत्यापित सेन्सर टेलिमेट्री उपलब्ध नाही. कॅलिब्रेट केलेल्या साधनांसह प्रत्यक्ष तपासणी आवश्यक आहे.',
  },
  {
    code: 'gu-IN',
    label: 'Gujarati (ગુજરાતી)',
    nativeLabel: 'ગુજરાતી',
    name: 'Gujarati',
    bcp47: 'gu-IN',
    voiceHints: ['Google ગુજરાતી', 'Microsoft Dhwani', 'gu-IN', 'gu_IN'],
    missingRecordsMessage:
      'આ મશીનના પ્રમાણિત રેકોર્ડ્સમાં વિનંતી કરેલ ચોક્કસ માહિતી ઉપલબ્ધ નથી.',
    insufficientEvidenceMessage:
      'અધિકૃત પ્લાન્ટ દસ્તાવેજોમાં આ પ્રશ્નનો સુરક્ષિત જવાબ આપવા માટે અપૂરતા પુરાવા છે. કૃપા કરીને વરિષ્ઠ એન્જિનિયરિંગનો સંપર્ક કરો.',
    lotoHeader: 'ફરજિયાત OSHA / LOTO સુરક્ષા નિર્દેશ અને આઇસોલેશન ચેતવણી',
    lotoProtocolPrefix: 'ફરજિયાત લૉકઆઉટ/ટૅગઆઉટ પ્રોટોકોલ — જોખમ:',
    lotoZeroEnergyRequirement: 'શારીરિક સંપર્ક પહેલાં શૂન્ય ઊર્જા સ્થિતિની ચકાસણી ફરજિયાત છે.',
    lotoProcedurePrefix: 'ચકાસાયેલ આઇસોલેશન પ્રક્રિયા:',
    lotoDefaultAction:
      'પ્રાથમિક ઊર્જા ફીડરને લૉકઆઉટ/ટૅગઆઉટ કરો, ઇલેક્ટ્રિકલ બ્રેકર્સ ડી-એનર્જાઇઝ કરો, સક્શન/ડિસ્ચાર્જ વાલ્વ બંધ કરો અને દબાણ બહાર કાઢો.',
    conflictHeader: 'દસ્તાવેજીકરણ વિસંગતતા જણાઈ',
    conflictMessage:
      'અનુક્રમિત સ્ત્રોતો વચ્ચે વિરોધાભાસી વિશિષ્ટતાઓ મળી આવી છે. એન્જિનિયરિંગ મંજૂરી વિના ફીલ્ડ ગોઠવણ કરશો નહીં.',
    insufficientDocHeader: 'અપૂરતા પ્લાન્ટ દસ્તાવેજીકરણ પુરાવા',
    insufficientDocMessage:
      'ForgeX સુરક્ષા નીતિ ઓપરેશનલ મર્યાદાઓનું અનુમાન લગાવવાની સખત મનાઈ કરે છે.',
    measurementNotice:
      'આ મશીન માટે કોઈ ચકાસાયેલ સેન્સર ટેલિમેટ્રી ઉપલબ્ધ નથી. કેલિબ્રેટેડ સાધનો સાથે ભૌતિક નિરીક્ષણ જરૂરી છે.',
  },
  {
    code: 'ta-IN',
    label: 'Tamil (தமிழ்)',
    nativeLabel: 'தமிழ்',
    name: 'Tamil',
    bcp47: 'ta-IN',
    voiceHints: ['Google தமிழ்', 'Microsoft Pallavi', 'ta-IN', 'ta_IN'],
    missingRecordsMessage:
      'இந்த இயந்திரத்திற்கான சரிபார்க்கப்பட்ட பதிவுகளில் கோரப்பட்ட குறிப்பிட்ட தகவல் கிடைக்கவில்லை.',
    insufficientEvidenceMessage:
      'அங்கீகரிக்கப்பட்ட ஆலை ஆவணங்களில் இந்த கேள்விக்கு பாதுகாப்பாக பதிலளிக்க போதுமான ஆதாரம் இல்லை. தயவுசெய்து மூத்த பொறியாளரை அணுகவும்.',
    lotoHeader: 'கட்டாய OSHA / LOTO பாதுகாப்பு வழிகாட்டல் & தனிமைப்படுத்தல் எச்சரிக்கை',
    lotoProtocolPrefix: 'கட்டாய லாக்அவுட்/டேக்அவுட் நெறிமுறை — ஆபத்து:',
    lotoZeroEnergyRequirement: 'இயந்திரத்தை அணுகுவதற்கு முன் பூஜ்ஜிய ஆற்றல் நிலையைச் சரிபார்ப்பது கட்டாயமாகும்.',
    lotoProcedurePrefix: 'சரிபார்க்கப்பட்ட தனிமைப்படுத்தல் செயல்முறை:',
    lotoDefaultAction:
      'முதன்மை மின்சாரத்தை லாக்அவுட்/டேக்அவுட் செய்யவும், பிரேக்கர்களை ஆஃப் செய்யவும், வால்வுகளை மூடவும் மற்றும் அழுத்தத்தை வெளியேற்றவும்.',
    conflictHeader: 'ஆவண முரண்பாடு கண்டறியப்பட்டது',
    conflictMessage:
      'ஆவணங்களில் முரண்பாடான விவரக்குறிப்புகள் கண்டறியப்பட்டுள்ளன. பொறியியல் அனுமதியின்றி கள மாற்றங்களைச் செய்ய வேண்டாம்.',
    insufficientDocHeader: 'போதுமான ஆலை ஆவண ஆதாரம் இல்லை',
    insufficientDocMessage:
      'ForgeX பாதுகாப்புக் கொள்கை இயக்க வரம்புகளை ஊகிப்பதை கண்டிப்பாகத் தடைசெய்கிறது.',
    measurementNotice:
      'இந்த இயந்திரத்திற்கு சரிபார்க்கப்பட்ட சென்சார் அளவீடு கிடைக்கவில்லை. துல்லியமான கருவிகளுடன் நேரடி ஆய்வு தேவை.',
  },
  {
    code: 'te-IN',
    label: 'Telugu (తెలుగు)',
    nativeLabel: 'తెలుగు',
    name: 'Telugu',
    bcp47: 'te-IN',
    voiceHints: ['Google తెలుగు', 'Microsoft Shruti', 'te-IN', 'te_IN'],
    missingRecordsMessage:
      'ఈ మెషిన్ యొక్క ధృవీకరించబడిన రికార్డులలో అభ్యర్థించిన నిర్దిష్ట సమాచారం అందుబాటులో లేదు.',
    insufficientEvidenceMessage:
      'ఈ ప్రశ్నకు సురక్షితంగా సమాధానం ఇవ్వడానికి అధీకృత ప్లాంట్ డాక్యుమెంటేషన్‌లో తగిన ఆధారాలు లేవు. దయచేసి సీనియర్ ఇంజనీరింగ్‌ను సంప్రదించండి.',
    lotoHeader: 'తప్పనిసరి OSHA / LOTO భద్రతా ఆదేశం & ఐసోలేషన్ హెచ్చరిక',
    lotoProtocolPrefix: 'తప్పనిసరి లాకౌట్/ట్యాగౌట్ ప్రోటోకాల్ — ప్రమాదం:',
    lotoZeroEnergyRequirement: 'భౌతిక పరికరాలను తాకడానికి ముందు జీరో ఎనర్జీ స్టేట్ ధృవీకరణ తప్పనిసరి.',
    lotoProcedurePrefix: 'ధృవీకరించబడిన ఐసోలేషన్ విధానం:',
    lotoDefaultAction:
      'ప్రధాన విద్యుత్ ఫీడర్‌ను లాకౌట్/ట్యాగౌట్ చేయండి, బ్రేకర్లను డి-ఎనర్జైజ్ చేయండి, ఐసోలేషన్ వాల్వ్‌లను మూసివేయండి మరియు ప్రెషర్ రిలీజ్ చేయండి.',
    conflictHeader: 'డాక్యుమెంటేషన్ వైరుధ్యం కనుగొనబడింది',
    conflictMessage:
      'ఇండెక్స్ చేయబడిన మూలాల మధ్య పరస్పర విరుద్ధమైన వివరాలు గుర్తించబడ్డాయి. ఇంజనీరింగ్ అనుమతి లేకుండా ఫీల్డ్ సర్దుబాట్లు చేయవద్దు.',
    insufficientDocHeader: 'సరిపోని ప్లాంట్ డాక్యుమెంటేషన్ ఆధారాలు',
    insufficientDocMessage:
      'ForgeX భద్రతా విధానం ఆపరేషనల్ పరిమితులను ఊహించడాన్ని ఖచ్చితంగా నిషేధిస్తుంది.',
    measurementNotice:
      'ఈ యంత్రం కోసం ధృవీకరించబడిన సెన్సార్ రీడింగ్‌లు అందుబాటులో లేవు. క్యాలిబ్రేటెడ్ సాధనాలతో భౌతిక తనిఖీ అవసరం.',
  },
  {
    code: 'kn-IN',
    label: 'Kannada (ಕನ್ನಡ)',
    nativeLabel: 'ಕನ್ನಡ',
    name: 'Kannada',
    bcp47: 'kn-IN',
    voiceHints: ['Google ಕನ್ನಡ', 'Microsoft Sapna', 'kn-IN', 'kn_IN'],
    missingRecordsMessage:
      'ಈ ಯಂತ್ರದ ಪರಿಶೀಲಿಸಿದ ದಾಖಲೆಗಳಲ್ಲಿ ವಿನಂತಿಸಿದ ನಿರ್ದಿಷ್ಟ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ.',
    insufficientEvidenceMessage:
      'ಈ ಪ್ರಶ್ನೆಗೆ ಸುರಕ್ಷಿತವಾಗಿ ಉತ್ತರಿಸಲು ಅಧಿಕೃತ ಸ್ಥಾವರ ದಾಖಲೆಗಳಲ್ಲಿ ಸಾಕಷ್ಟು ಪುರಾವೆಗಳಿಲ್ಲ. ದಯವಿಟ್ಟು ಹಿರಿಯ ಎಂಜಿನಿಯರಿಂಗ್ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    lotoHeader: 'ಕಡ್ಡಾಯ OSHA / LOTO ಸುರಕ್ಷತಾ ನಿರ್ದೇಶನ ಮತ್ತು ಪ್ರತ್ಯೇಕತೆಯ ಎಚ್ಚರಿಕೆ',
    lotoProtocolPrefix: 'ಕಡ್ಡಾಯ ಲಾಕ್‌ಔಟ್/ಟ್ಯಾಗ್‌ಔಟ್ ಪ್ರೋಟೋಕಾಲ್ — ಅಪಾಯ:',
    lotoZeroEnergyRequirement: 'ಭೌತಿಕ ಸಂಪರ್ಕದ ಮೊದಲು ಶೂನ್ಯ ಶಕ್ತಿ ಸ್ಥಿತಿಯ ಪರಿಶೀಲನೆ ಕಡ್ಡಾಯವಾಗಿದೆ.',
    lotoProcedurePrefix: 'ಪರಿಶೀಲಿಸಿದ ಪ್ರತ್ಯೇಕತೆಯ ವಿಧಾನ:',
    lotoDefaultAction:
      'ಪ್ರಾಥಮಿಕ ಶಕ್ತಿ ಫೀಡರ್ ಅನ್ನು ಲಾಕ್‌ಔಟ್/ಟ್ಯಾಗ್‌ಔಟ್ ಮಾಡಿ, ವಿದ್ಯುತ್ ಬ್ರೇಕರ್‌ಗಳನ್ನು ಆಫ್ ಮಾಡಿ, ಕವಾಟಗಳನ್ನು ಮುಚ್ಚಿ ಮತ್ತು ಉಳಿದ ಒತ್ತಡವನ್ನು ಹೊರಹಾಕಿ.',
    conflictHeader: 'ದಾಖಲಾತಿ ವ್ಯತ್ಯಾಸ ಕಂಡುಬಂದಿದೆ',
    conflictMessage:
      'ಮೂಲಗಳ ನಡುವೆ ಪರಸ್ಪರ ವಿರುದ್ಧ ವಿವರಣೆಗಳು ಕಂಡುಬಂದಿವೆ. ಎಂಜಿನಿಯರಿಂಗ್ ಅನುಮೋದನೆಯಿಲ್ಲದೆ ಕ್ಷೇತ್ರ ಹೊಂದಾಣಿಕೆಗಳನ್ನು ಮಾಡಬೇಡಿ.',
    insufficientDocHeader: 'ಅಪೂರ್ಣ ಸ್ಥಾವರ ದಾಖಲಾತಿ ಪುರಾವೆ',
    insufficientDocMessage:
      'ForgeX ಸುರಕ್ಷತಾ ನೀತಿಯು ಕಾರ್ಯಾಚರಣಾ ಮಿತಿಗಳನ್ನು ಊಹಿಸುವುದನ್ನು ಕಟ್ಟುನಿಟ್ಟಾಗಿ ನಿಷೇಧಿಸುತ್ತದೆ.',
    measurementNotice:
      'ಈ ಯಂತ್ರಕ್ಕಾಗಿ ಯಾವುದೇ ಪರಿಶೀಲಿಸಿದ ಸಂವೇದಕ ಟೆಲಿಮೆಟ್ರಿ ಲಭ್ಯವಿಲ್ಲ. ಮಾಪನಾಂಕ ನಿರ್ಣಯಿಸಿದ ಉಪಕರಣಗಳೊಂದಿಗೆ ಭೌತಿಕ ತಪಾಸಣೆ ಅಗತ್ಯವಿದೆ.',
  },
  {
    code: 'bn-IN',
    label: 'Bengali (বাংলা)',
    nativeLabel: 'বাংলা',
    name: 'Bengali',
    bcp47: 'bn-IN',
    voiceHints: ['Google বাংলা', 'Microsoft Tanishaa', 'bn-IN', 'bn_IN'],
    missingRecordsMessage:
      'এই মেশিনের যাচাইকৃত রেকর্ডে অনুরোধ করা নির্দিষ্ট তথ্য উপলব্ধ নেই।',
    insufficientEvidenceMessage:
      'অনুমোদিত প্ল্যান্ট নথিপত্রে এই প্রশ্নের নিরাপদ উত্তর দেওয়ার মতো পর্যাপ্ত প্রমাণ নেই। অনুগ্রহ করে ঊর্ধ্বতন ইঞ্জিনিয়ারিংয়ের সাথে পরামর্শ করুন।',
    lotoHeader: 'বাধ্যতামূলক OSHA / LOTO নিরাপত্তা নির্দেশিকা এবং আইসোলেশন সতর্কতা',
    lotoProtocolPrefix: 'বাধ্যতামূলক লকআউট/ট্যাগআউট প্রোটোকল — বিপদ:',
    lotoZeroEnergyRequirement: 'শারীরিক যোগাযোগের আগে জিরো এনার্জি স্টেট যাচাইকরণ বাধ্যতামূলক।',
    lotoProcedurePrefix: 'যাচাইকৃত আইসোলেশন পদ্ধতি:',
    lotoDefaultAction:
      'প্রাথমিক শক্তি ফিডার লকআউট/ট্যাগআউট করুন, ব্রেকার ডি-এনার্জাইজ করুন, আইসোলেশন ভালভ বন্ধ করুন এবং অবশিষ্ট চাপ নির্গমন করুন।',
    conflictHeader: 'নথিপত্রের অসঙ্গতি শনাক্ত হয়েছে',
    conflictMessage:
      'উৎসগুলির মধ্যে পরস্পরবিরোধী স্পেসিফিকেশন পাওয়া গেছে। ইঞ্জিনিয়ারিং সাইন-অফ ছাড়া ফিল্ড সমন্বয় করবেন না।',
    insufficientDocHeader: 'অপর্যাপ্ত প্ল্যান্ট নথিপত্র প্রমাণ',
    insufficientDocMessage:
      'ForgeX নিরাপত্তা নীতি অপারেটিং সীমার অনুমান করা কঠোরভাবে নিষিদ্ধ করে।',
    measurementNotice:
      'এই মেশিনের জন্য কোনো যাচাইকৃত সেন্সর রিডিং উপলব্ধ নেই। ক্যালিব্রেট করা সরঞ্জামের সাথে শারীরিক পরিদর্শন প্রয়োজন।',
  },
  {
    code: 'pa-IN',
    label: 'Punjabi (ਪੰਜਾਬੀ)',
    nativeLabel: 'ਪੰਜਾਬੀ',
    name: 'Punjabi',
    bcp47: 'pa-IN',
    voiceHints: ['Google ਪੰਜਾਬੀ', 'pa-IN', 'pa_IN'],
    missingRecordsMessage:
      'ਇਸ ਮਸ਼ੀਨ ਦੇ ਤਸਦੀਕ ਕੀਤੇ ਰਿਕਾਰਡਾਂ ਵਿੱਚ ਬੇਨਤੀ ਕੀਤੀ ਗਈ ਵਿਸ਼ੇਸ਼ ਜਾਣਕਾਰੀ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।',
    insufficientEvidenceMessage:
      'ਅਧਿਕਾਰਤ ਪਲਾਂਟ ਦਸਤਾਵੇਜ਼ਾਂ ਵਿੱਚ ਇਸ ਸਵਾਲ ਦਾ ਸੁਰੱਖਿਅਤ ਜਵਾਬ ਦੇਣ ਲਈ ਕਾਫ਼ੀ ਸਬੂਤ ਨਹੀਂ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਸੀਨੀਅਰ ਇੰਜੀਨੀਅਰਿੰਗ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।',
    lotoHeader: 'ਲਾਜ਼ਮੀ OSHA / LOTO ਸੁਰੱਖਿਆ ਨਿਰਦੇਸ਼ ਅਤੇ ਆਈਸੋਲੇਸ਼ਨ ਚੇਤਾਵਨੀ',
    lotoProtocolPrefix: 'ਲਾਜ਼ਮੀ ਲਾਕਆਊਟ/ਟੈਗਆਊਟ ਪ੍ਰੋਟੋਕੋਲ — ਖਤਰਾ:',
    lotoZeroEnergyRequirement: 'ਸਰੀਰਕ ਸੰਪਰਕ ਤੋਂ ਪਹਿਲਾਂ ਜ਼ੀਰੋ ਐਨਰਜੀ ਸਟੇਟ ਦੀ ਪੁਸ਼ਟੀ ਲਾਜ਼ਮੀ ਹੈ।',
    lotoProcedurePrefix: 'ਤਸਦੀਕ ਕੀਤੀ ਆਈਸੋਲੇਸ਼ਨ ਪ੍ਰਕਿਰਿਆ:',
    lotoDefaultAction:
      'ਮੁੱਖ ਪਾਵਰ ਫੀਡਰ ਨੂੰ ਲਾਕਆਊਟ/ਟੈਗਆਊਟ ਕਰੋ, ਇਲੈਕਟ੍ਰੀਕਲ ਬ੍ਰੇਕਰ ਬੰਦ ਕਰੋ, ਵਾਲਵ ਬੰਦ ਕਰੋ ਅਤੇ ਬਚਿਆ ਦਬਾਅ ਬਾਹਰ ਕੱਢੋ।',
    conflictHeader: 'ਦਸਤਾਵੇਜ਼ੀ ਅਸੰਗਤਤਾ ਪਾਈ ਗਈ',
    conflictMessage:
      'ਸਰੋਤਾਂ ਵਿਚਕਾਰ ਪਰਸਪਰ ਵਿਰੋਧੀ ਨਿਰਦੇਸ਼ ਮਿਲੇ ਹਨ। ਇੰਜੀਨੀਅਰਿੰਗ ਮਨਜ਼ੂਰੀ ਤੋਂ ਬਿਨਾਂ ਫੀਲਡ ਬਦਲਾਅ ਨਾ ਕਰੋ।',
    insufficientDocHeader: 'ਨਾਕਾਫ਼ੀ ਪਲਾਂਟ ਦਸਤਾਵੇਜ਼ ਸਬੂਤ',
    insufficientDocMessage:
      'ForgeX ਸੁਰੱਖਿਆ ਨੀਤੀ ਓਪਰੇਟਿੰਗ ਸੀਮਾਵਾਂ ਦਾ ਅੰਦਾਜ਼ਾ ਲਗਾਉਣ ਦੀ ਸਖ਼ਤ ਮਨਾਹੀ ਕਰਦੀ ਹੈ।',
    measurementNotice:
      'ਇਸ ਮਸ਼ੀਨ ਲਈ ਕੋਈ ਪ੍ਰਮਾਣਿਤ ਸੈਂਸਰ ਰੀਡਿੰਗ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। ਕੈਲੀਬਰੇਟ ਕੀਤੇ ਔਜ਼ਾਰਾਂ ਨਾਲ ਨਿਰੀਖਣ ਜ਼ਰੂਰੀ ਹੈ।',
  },
  {
    code: 'es-ES',
    label: 'Spanish (Español)',
    nativeLabel: 'Español',
    name: 'Spanish',
    bcp47: 'es-ES',
    voiceHints: ['Google español', 'Microsoft Helena', 'Microsoft Laura', 'es-ES', 'es-MX'],
    missingRecordsMessage:
      'La información específica solicitada no está disponible en los registros verificados de esta máquina.',
    insufficientEvidenceMessage:
      'Evidencia insuficiente en la documentación autorizada de la planta para responder a esta pregunta de manera segura. Consulte con ingeniería de planta.',
    lotoHeader: 'DIRECTIVA DE SEGURIDAD OBLIGATORIA OSHA / LOTO Y ADVERTENCIA DE AISLAMIENTO',
    lotoProtocolPrefix: 'PROTOCOLO OBLIGATORIO DE BLOQUEO/ETIQUETADO — PELIGRO:',
    lotoZeroEnergyRequirement: 'Verificación obligatoria de estado de energía cero antes del contacto físico.',
    lotoProcedurePrefix: 'Procedimiento de aislamiento verificado:',
    lotoDefaultAction:
      'Bloquee/etiquete el alimentador principal de energía, desenergice los disyuntores eléctricos, cierre las válvulas de aislamiento y purgue la presión.',
    conflictHeader: 'DISCREPANCIA / CONFLICTO EN LA DOCUMENTACIÓN IDENTIFICADO',
    conflictMessage:
      'Se detectaron especificaciones contradictorias entre las fuentes indexadas. No ejecute ajustes en campo sin la aprobación de ingeniería.',
    insufficientDocHeader: 'EVIDENCIA DE DOCUMENTACIÓN DE PLANTA INSUFICIENTE',
    insufficientDocMessage:
      'La política de seguridad de ForgeX prohíbe estrictamente suponer o alucinar límites operativos o telemetría.',
    measurementNotice:
      'No hay lecturas de sensores ni telemetría calibrada disponibles para esta máquina. Se requiere inspección física con herramientas calibradas.',
  },
  {
    code: 'de-DE',
    label: 'German (Deutsch)',
    nativeLabel: 'Deutsch',
    name: 'German',
    bcp47: 'de-DE',
    voiceHints: ['Google Deutsch', 'Microsoft Hedda', 'Microsoft Stefan', 'de-DE'],
    missingRecordsMessage:
      'Die angeforderten spezifischen Informationen sind in den verifizierten Unterlagen dieser Maschine nicht verfügbar.',
    insufficientEvidenceMessage:
      'Unzureichende Nachweise in der autorisierten Anlagendokumentation, um diese Frage sicher zu beantworten. Bitte wenden Sie sich an die Fachabteilung.',
    lotoHeader: 'VERBINDLICHE OSHA / LOTO-SICHERHEITSVORSCHRIFT & ISOLIERUNGSWARNUNG',
    lotoProtocolPrefix: 'VERBINDLICHES LOCKOUT/TAGOUT-PROTOKOLL — GEFAHR:',
    lotoZeroEnergyRequirement: 'Verbindliche Überprüfung des energielosen Zustands vor physischem Kontakt erforderlich.',
    lotoProcedurePrefix: 'Verifiziertes Isolierungsverfahren:',
    lotoDefaultAction:
      'Hauptenergieversorgung verriegeln/kennzeichnen, Schutzschalter freischalten, Absperrventile schließen und Restdruck abbauen.',
    conflictHeader: 'DOKUMENTATIONSDISKREPANZ / KONFLIKT FESTGESTELLT',
    conflictMessage:
      'Widersprüchliche Spezifikationen zwischen den indexierten Quellen erkannt. Führen Sie keine Arbeiten ohne Freigabe der Technik durch.',
    insufficientDocHeader: 'UNZUREICHENDE DOKUMENTATIONSEVIDENZ DER ANLAGE',
    insufficientDocMessage:
      'Die ForgeX-Sicherheitsrichtlinie untersagt das Erraten von Betriebsgrenzen oder Telemetriewerten strikt.',
    measurementNotice:
      'Für diese Maschine sind keine verifizierten Sensordaten verfügbar. Eine physische Inspektion mit kalibrierten Instrumenten ist erforderlich.',
  },
  {
    code: 'ja-JP',
    label: 'Japanese (日本語)',
    nativeLabel: '日本語',
    name: 'Japanese',
    bcp47: 'ja-JP',
    voiceHints: ['Google 日本語', 'Microsoft Haruka', 'Microsoft Ichiro', 'ja-JP'],
    missingRecordsMessage:
      '要求された特定の情報は、この機械の検証済み記録には記載されていません。',
    insufficientEvidenceMessage:
      '承認されたプラント文書には、安全に回答するための十分な証拠がありません。担当エンジニアにご相談ください。',
    lotoHeader: '必須 OSHA / LOTO 安全指示および隔離警告',
    lotoProtocolPrefix: '必須ロックアウト/タグアウトプロトコル — 危険:',
    lotoZeroEnergyRequirement: '物理的接触の前にゼロエネルギー状態の確認が必須です。',
    lotoProcedurePrefix: '検証済み隔離手順:',
    lotoDefaultAction:
      '主電源フィーダーをロックアウト/タグアウトし、ブレーカーを遮断し、吸込/吐出隔離バルブを閉じ、残留圧力を解放してください。',
    conflictHeader: '文書の不一致/矛盾を検出',
    conflictMessage:
      'インデックスされた資料間で矛盾する仕様が検出されました。エンジニアリングの承認なしに現場調整を実施しないでください。',
    insufficientDocHeader: 'プラント文書の証拠不足',
    insufficientDocMessage:
      'ForgeXの安全ポリシーは、動作制限や機器テレメトリを推测・捏造することを固く禁じています。',
    measurementNotice:
      'この機械について検証済みのセンサーテレメトリはありません。校正済み測定器による現地目視確認が必要です。',
  },
];

export function getLanguageConfig(codeOrLocale?: string | null): SupportedLanguageConfig {
  if (!codeOrLocale) return SUPPORTED_LANGUAGES[0];
  const normalized = codeOrLocale.toLowerCase().replace('_', '-').trim();

  // Exact match
  const exact = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === normalized || l.bcp47.toLowerCase() === normalized
  );
  if (exact) return exact;

  // Prefix match (e.g. 'hi' matches 'hi-IN', 'es' matches 'es-ES')
  const prefix = normalized.split('-')[0];
  const byPrefix = SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase().startsWith(prefix));
  if (byPrefix) return byPrefix;

  return SUPPORTED_LANGUAGES[0];
}

export function formatLocalizedLotoAlert(
  langConfig: SupportedLanguageConfig,
  hazards: string[],
  lotoProcedure?: string | null
): string {
  const hazardsStr = hazards.length > 0 ? hazards.join(', ') : 'INDUSTRIAL_ENERGY';
  let alert = `${langConfig.lotoProtocolPrefix} ${hazardsStr}. ${langConfig.lotoZeroEnergyRequirement}`;
  if (lotoProcedure) {
    alert += ` ${langConfig.lotoProcedurePrefix} "${lotoProcedure}".`;
  } else {
    alert += ` ${langConfig.lotoDefaultAction}`;
  }
  return alert;
}
