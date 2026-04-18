Module build failed (from ./node_modules/babel-loader/lib/index.js):
SyntaxError: /Users/rex/OCS/src/App/workers/audio.processor.js: Unexpected token, expected "{" (3:11)

[0m [90m 1 |[39m [90m// AudioWorklet to capture and stream audio buffers[39m
 [90m 2 |[39m [36mclass[39m [33mAudioProcessor[39m [36mextends[39m [33mAudioWorkletProcessor[39m {
[31m[1m>[22m[39m[90m 3 |[39m     [36msuper[39m()[33m;[39m
 [90m   |[39m            [31m[1m^[22m[39m
 [90m 4 |[39m     [36mthis[39m[33m.[39mbufferSize [33m=[39m [35m2048[39m[33m;[39m [90m// Faster streaming for lower latency[39m
 [90m 5 |[39m     [36mthis[39m[33m.[39mbuffer [33m=[39m [36mnew[39m [33mFloat32Array[39m([36mthis[39m[33m.[39mbufferSize)[33m;[39m
 [90m 6 |[39m     [36mthis[39m[33m.[39mptr [33m=[39m [35m0[39m[33m;[39m[0m
    at constructor (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:367:19)
    at JSXParserMixin.raise (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:6624:19)
    at JSXParserMixin.unexpected (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:6644:16)
    at JSXParserMixin.expect (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:6924:12)
    at JSXParserMixin.parseBlock (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13369:10)
    at JSXParserMixin.parseFunctionBody (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12174:24)
    at JSXParserMixin.parseFunctionBodyAndFinish (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12160:10)
    at JSXParserMixin.parseMethod (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12118:31)
    at JSXParserMixin.pushClassMethod (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13803:30)
    at JSXParserMixin.parseClassMemberWithIsStatic (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13691:12)
    at JSXParserMixin.parseClassMember (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13639:10)
    at /Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13593:14
    at JSXParserMixin.withSmartMixTopicForbiddingContext (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12477:14)
    at JSXParserMixin.parseClassBody (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13575:10)
    at JSXParserMixin.parseClass (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13550:22)
    at JSXParserMixin.parseStatementContent (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12870:21)
    at JSXParserMixin.parseStatementLike (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12843:17)
    at JSXParserMixin.parseModuleItem (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12820:17)
    at JSXParserMixin.parseBlockOrModuleBlockBody (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13392:36)
    at JSXParserMixin.parseBlockBody (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:13385:10)
    at JSXParserMixin.parseProgram (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12698:10)
    at JSXParserMixin.parseTopLevel (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:12688:25)
    at JSXParserMixin.parse (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:14568:25)
    at parse (/Users/rex/OCS/node_modules/@babel/parser/lib/index.js:14602:38)
    at parser (/Users/rex/OCS/node_modules/@babel/core/lib/parser/index.js:41:34)
    at parser.next (<anonymous>)
    at normalizeFile (/Users/rex/OCS/node_modules/@babel/core/lib/transformation/normalize-file.js:64:37)
    at normalizeFile.next (<anonymous>)
    at run (/Users/rex/OCS/node_modules/@babel/core/lib/transformation/index.js:22:50)
    at run.next (<anonymous>)
    at transform (/Users/rex/OCS/node_modules/@babel/core/lib/transform.js:22:33)
    at transform.next (<anonymous>)
    at step (/Users/rex/OCS/node_modules/gensync/index.js:261:32)
    at /Users/rex/OCS/node_modules/gensync/index.js:273:13
    at async.call.result.err.err (/Users/rex/OCS/node_modules/gensync/index.js:223:11)