import type { SVGProps } from "react";

/**
 * Icon artwork copied from the reference catalog so the app draws the same
 * shapes. Each entry keeps the reference viewBox and body; strokes inherit
 * currentColor, so the semantic text tokens keep controlling the color.
 */
const art: Record<string, { viewBox: string; body: string }> = {
  "arrow-down-to-line": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M15.2083 11.6667L10 16.875L4.79167 11.6667M10 16.25V3.125\" stroke=\"currentColor\" stroke-width=\"1.25\" stroke-linecap=\"square\"/>",
  },
  "outline-arrow-left": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.44442 7.99999H13.5555M6.22221 4.22222L2.44442 7.99999L6.22221 11.7778\" stroke=\"currentColor\"/>",
  },
  "outline-arrow-right": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M13.5555 7.99999H2.4444M9.77773 11.7778L13.5555 7.99999L9.77773 4.22222\" stroke=\"currentColor\"/>",
  },
  "arrow-up": {
    viewBox: "0 0 20 20",
    body: "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M9.99991 2.24121L16.0921 8.33343L15.2083 9.21731L10.6249 4.63397V17.5001H9.37492V4.63398L4.7916 9.21731L3.90771 8.33343L9.99991 2.24121Z\" fill=\"currentColor\"/>",
  },
  "circle-ban-sign": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M15.3675 4.63087L4.55742 15.441M17.9163 9.9987C17.9163 14.371 14.3719 17.9154 9.99967 17.9154C7.81355 17.9154 5.83438 17.0293 4.40175 15.5966C2.96911 14.164 2.08301 12.1848 2.08301 9.9987C2.08301 5.62644 5.62742 2.08203 9.99967 2.08203C12.1858 2.08203 14.165 2.96813 15.5976 4.40077C17.0302 5.8334 17.9163 7.81257 17.9163 9.9987Z\" stroke=\"currentColor\" stroke-linecap=\"round\"/>",
  },
  "notifications": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M14.8889 6.77778V9.11112C14.8889 10.093 14.8889 10.8889 14.8889 10.8889H11.3334M5.55558 10.8889H2C2 10.8889 2.00001 10.093 2.00001 9.11112V3.77778C2.00001 2.79594 2.00009 2 2.00009 2H9.44531M5.55558 10.8889V13.1111H8.44447H11.3334V10.8889M5.55558 10.8889H11.3334\" stroke=\"currentColor\"/><path d=\"M13 5C14.1046 5 15 4.10457 15 3C15 1.89543 14.1046 1 13 1C11.8954 1 11 1.89543 11 3C11 4.10457 11.8954 5 13 5Z\" stroke=\"currentColor\"/>",
  },
  "brain": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M13.332 8.7487C11.4911 8.7487 9.9987 7.25631 9.9987 5.41536M6.66536 11.2487C8.50631 11.2487 9.9987 12.7411 9.9987 14.582M9.9987 2.78209L9.9987 17.0658M16.004 15.0475C17.1255 14.5876 17.9154 13.4849 17.9154 12.1978C17.9154 11.3363 17.5615 10.5575 16.9913 9.9987C17.5615 9.43991 17.9154 8.66108 17.9154 7.79962C17.9154 6.21199 16.7136 4.90504 15.1702 4.73878C14.7858 3.21216 13.4039 2.08203 11.758 2.08203C11.1171 2.08203 10.5162 2.25337 9.9987 2.55275C9.48117 2.25337 8.88032 2.08203 8.23944 2.08203C6.59353 2.08203 5.21157 3.21216 4.82722 4.73878C3.28377 4.90504 2.08203 6.21199 2.08203 7.79962C2.08203 8.66108 2.43585 9.43991 3.00609 9.9987C2.43585 10.5575 2.08203 11.3363 2.08203 12.1978C2.08203 13.4849 2.87191 14.5876 3.99339 15.0475C4.46688 16.7033 5.9917 17.9154 7.79962 17.9154C8.61335 17.9154 9.36972 17.6698 9.9987 17.2488C10.6277 17.6698 11.384 17.9154 12.1978 17.9154C14.0057 17.9154 15.5305 16.7033 16.004 15.0475Z\" stroke=\"currentColor\"/>",
  },
  "cube": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M10 2.5L16.5 6.25V13.75L10 17.5L3.5 13.75V6.25L10 2.5Z\" stroke=\"currentColor\"/><path d=\"M10 10L16.5 6.25M10 10V17.5M10 10L3.5 6.25\" stroke=\"currentColor\"/>",
  },
  "check": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M3.53613 8.17857L6.39328 11.75L12.4647 4.25\" stroke=\"currentColor\"/>",
  },
  "chevron-down": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M5 6.5L8 9.5L11 6.5\" stroke=\"currentColor\"/>",
  },
  "outline-chevron-right": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M6.5 11L9.5 8L6.5 5\" stroke=\"currentColor\"/>",
  },
  "chevron-grabber-vertical": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M6.66675 12.4998L10.0001 15.8332L13.3334 12.4998M6.66675 7.49984L10.0001 4.1665L13.3334 7.49984\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "circle-exclamation": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8.75 11.75H7.25V10.25H8.75V11.75Z\" fill=\"currentColor\"/><path d=\"M8.75 9.25H7.25V4.25H8.75V9.25Z\" fill=\"currentColor\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M8 1C9.93286 1 11.684 1.7836 12.9502 3.0498C14.2164 4.31601 15 6.06714 15 8C15 11.866 11.866 15 8 15C6.06714 15 4.31601 14.2164 3.0498 12.9502C1.7836 11.684 1 9.93286 1 8C1 4.13401 4.13401 1 8 1ZM8 2C4.68629 2 2 4.68629 2 8C2 9.65699 2.67148 11.1559 3.75781 12.2422C4.84415 13.3285 6.34301 14 8 14C11.3137 14 14 11.3137 14 8C14 6.34301 13.3285 4.84415 12.2422 3.75781C11.1559 2.67148 9.65699 2 8 2Z\" fill=\"currentColor\"/>",
  },
  "copy": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z\" stroke=\"currentColor\" stroke-linecap=\"round\"/>",
  },
  "checklist": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M9.58342 13.7498H17.0834M9.58342 6.24984H17.0834M2.91675 6.6665L4.58341 7.9165L7.08341 4.1665M2.91675 14.1665L4.58341 15.4165L7.08341 11.6665\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "code-slash": {
    viewBox: "0 0 16 16",
    body: "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M10.0812 2.10803L6.55974 14.0809L5.92016 13.8928L9.44161 1.91992L10.0812 2.10803ZM4.13793 4.97275L1.44666 8.00045L4.13793 11.0281L3.63966 11.471L0.554688 8.00045L3.63966 4.52984L4.13793 4.97275ZM12.3617 4.52984L15.4467 8.00045L12.3617 11.471L11.8634 11.0281L14.5547 8.00045L11.8634 4.97275L12.3617 4.52984Z\" fill=\"currentColor\"/>",
  },
  "outline-square-arrow": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M13.5555 6.66656V2.44434H9.33326M13.5555 2.44434L7.99993 7.99989M13.5555 9.33324V13.5555C13.5555 13.5555 12.7599 13.5555 11.7777 13.5555H2.44438C2.44438 13.5555 2.44438 12.7599 2.44438 11.7777V4.22213C2.44438 3.2399 2.44434 2.44435 2.44434 2.44435H6.66661\" stroke=\"currentColor\"/>",
  },
  "outline-copy": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M9.5 3.5V1.5H1.5V10.5H4.5M6.5 14.5V5.5H14.5V14.5H6.5Z\" stroke=\"currentColor\"/>",
  },
  "models": {
    viewBox: "0 0 16 16",
    body: "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M14 8C9.83336 8 8 9.83336 8 14C8 9.83336 6.16666 8 2 8C6.16666 8 8 6.16666 8 2C8 6.16666 9.83336 8 14 8Z\" stroke=\"currentColor\"/>",
  },
  "server": {
    viewBox: "0 0 20 20",
    body: "<rect x=\"3.35547\" y=\"1.92969\" width=\"13.2857\" height=\"16.1429\" stroke=\"currentColor\"/><rect x=\"3.35547\" y=\"11.9297\" width=\"13.2857\" height=\"6.14286\" stroke=\"currentColor\"/><rect x=\"12.8555\" y=\"14.2852\" width=\"1.42857\" height=\"1.42857\" fill=\"currentColor\"/><rect x=\"10\" y=\"14.2852\" width=\"1.42857\" height=\"1.42857\" fill=\"currentColor\"/>",
  },
  "download": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M13.9583 10.6257L10 14.584L6.04167 10.6257M10 2.08398V13.959M16.25 17.9173H3.75\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "outline-dots": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.5 7.5H3.5V8.5H2.5V7.5Z\" stroke=\"currentColor\"/><path d=\"M7.5 7.5H8.5V8.5H7.5V7.5Z\" stroke=\"currentColor\"/><path d=\"M12.5 7.5H13.5V8.5H12.5V7.5Z\" stroke=\"currentColor\"/>",
  },
  "outline-arrow-up-right": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M12.5 3.5L3.5 12.5M12.5 9.62L12.5 3.5L6.38 3.5\" stroke=\"currentColor\"/>",
  },
  "outline-eye": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M2.5 10s3.33-5.42 7.5-5.42S17.5 10 17.5 10s-3.33 5.42-7.5 5.42S2.5 10 2.5 10Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"10\" cy=\"10\" r=\"2.5\" stroke=\"currentColor\"/>",
  },
  "outline-eye-slash": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M2.5 10s3.33-5.42 7.5-5.42S17.5 10 17.5 10s-3.33 5.42-7.5 5.42S2.5 10 2.5 10Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"10\" cy=\"10\" r=\"2.5\" stroke=\"currentColor\"/><path d=\"M3 3 17 17\" stroke=\"currentColor\" stroke-linecap=\"round\"/>",
  },
  "file-document": {
    viewBox: "0 0 14 14",
    body: "<path d=\"M7.58331 2.33333V5.25H10.5M2.91664 1.75H7.58331L11.0833 5.25V12.25H2.91664V1.75Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "review": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M7 14.5H13M7 7.99512H10.0049M10.0049 7.99512H13M10.0049 7.99512V5M10.0049 7.99512V11M18 18V2L2 2L2 18H18Z\" stroke=\"currentColor\"/>",
  },
  "flask": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M5.5 2H10.5M6 2V6L2.5 12C2 13 2.5 14 3.5 14H12.5C13.5 14 14 13 13.5 12L10 6V2M4.25 9H11.75\" stroke=\"currentColor\" stroke-linecap=\"square\" stroke-linejoin=\"round\"/>",
  },
  "folder": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M1.33337 2V13.3333H14.6667V4H8.66671L6.66671 2H1.33337Z\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-linecap=\"square\"/>",
  },
  "folder-add-left": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M7.5 13.3333H1.5V2H6.83333L8.83333 4H14.8333V6M10.1667 11.3333H15.5M12.8333 8.66667V14\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-linecap=\"square\"/>",
  },
  "filetree": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.5 1.5V12.2484H6.75M2.5 4.74838H6.75\" stroke=\"currentColor\"/><rect x=\"8.5\" y=\"3.2168\" width=\"6\" height=\"3\" fill=\"none\" stroke=\"currentColor\"/><rect x=\"8.5\" y=\"10.75\" width=\"6\" height=\"3\" fill=\"none\" stroke=\"currentColor\"/>",
  },
  "window-analytics": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M14.5 9.8333V13.5H1.5V2.5H7.1667M9.5 2.5V7.5H14.5V2.5H9.5Z\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-linecap=\"square\"/>",
  },
  "branch": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M5.118 5.686V10.314M5.118 5.686C5.97 5.686 6.661 4.995 6.661 4.143C6.661 3.291 5.97 2.6 5.118 2.6C4.266 2.6 3.575 3.291 3.575 4.143C3.575 4.995 4.266 5.686 5.118 5.686ZM5.118 10.314C4.266 10.314 3.575 11.005 3.575 11.857C3.575 12.709 4.266 13.4 5.118 13.4C5.97 13.4 6.661 12.709 6.661 11.857M5.118 10.314C5.97 10.314 6.661 11.005 6.661 11.857M10.882 5.686C11.734 5.686 12.425 4.995 12.425 4.143C12.425 3.291 11.734 2.6 10.882 2.6C10.03 2.6 9.339 3.291 9.339 4.143C9.339 4.995 10.03 5.686 10.882 5.686ZM10.882 5.686V9.457C10.882 10.783 9.807 11.857 8.482 11.857H6.661\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  },
  "fork": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M2.91602 7.91406L2.91602 2.91406H7.91602M12.0827 2.91406H17.0827L17.0827 7.91406M9.99935 9.9974L9.99935 17.0807M9.99935 9.9974L3.33268 3.33073M9.99935 9.9974L16.666 3.33073\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "outline-globe": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8.00001 14.4445C9.47277 14.4445 10.6667 11.5592 10.6667 8.00001C10.6667 4.44085 9.47277 1.55557 8.00001 1.55557M8.00001 14.4445C6.52725 14.4445 5.33335 11.5592 5.33335 8.00001C5.33335 4.44085 6.52725 1.55557 8.00001 1.55557M8.00001 14.4445C11.5592 14.4445 14.4444 11.5592 14.4444 8C14.4444 4.44083 11.5592 1.55557 8.00001 1.55557M8.00001 14.4445C4.44085 14.4445 1.55556 11.5592 1.55556 8C1.55556 4.44083 4.44085 1.55557 8.00001 1.55557M1.87203 6.00001H14.128M2.03555 10.4445H13.9644\" stroke=\"currentColor\"/>",
  },
  "grid-plus": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M13.9948 11.668H9.32812M11.6641 9.33203V13.9987M6.66667 9.33203V13.9987H2V9.33203H6.66667ZM6.66667 2V6.66667H2V2H6.66667ZM13.9948 2V6.66667H9.32812V2H13.9948Z\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-linecap=\"square\"/>",
  },
  "arrow-undo-down": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M4.08333 11.0859L1.75 8.7526L4.08333 6.41927M2.33333 8.7526L12.5417 8.7526L12.5417 3.21094L7 3.21094\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"square\"/>",
  },
  "outline-photo": {
    viewBox: "0 0 14 14",
    body: "<path d=\"M11.6666 11.6666L8.16663 8.16663L6.99997 9.33332L4.66663 6.99998L2.1583 9.50832M2.04163 2.04165H11.9583V11.9583H2.04163V2.04165ZM9.33332 5.24998C9.33332 5.81377 8.87629 6.27081 8.31244 6.27081C7.74866 6.27081 7.29163 5.81377 7.29163 5.24998C7.29163 4.68619 7.74866 4.22915 8.31244 4.22915C8.87629 4.22915 9.33332 4.68619 9.33332 5.24998Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "archive": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M13.1112 13.5555V14.0555H13.6112V13.5555H13.1112ZM2.889 13.5555H2.389L2.389 14.0555H2.889V13.5555ZM3.38901 5.55546L3.38901 5.05546L2.38901 5.05546L2.38901 5.55546L2.88901 5.55546L3.38901 5.55546ZM14.4446 2.44434H14.9446V1.94434L14.4446 1.94434L14.4446 2.44434ZM14.4446 5.55545L14.4446 6.05545L14.9446 6.05545V5.55545H14.4446ZM1.55566 5.55546L1.05566 5.55545L1.05566 6.05546L1.55566 6.05546L1.55566 5.55546ZM1.5557 2.44436L1.5557 1.94436L1.05571 1.94436L1.0557 2.44435L1.5557 2.44436ZM13.1112 5.55546H12.6112V13.5555H13.1112H13.6112V5.55546H13.1112ZM2.889 13.5555H3.389L3.38901 5.55546L2.88901 5.55546L2.38901 5.55546L2.389 13.5555H2.889ZM14.4446 2.44434H13.9446V5.55545H14.4446H14.9446V2.44434H14.4446ZM1.55566 5.55546L2.05566 5.55547L2.0557 2.44436L1.5557 2.44436L1.0557 2.44435L1.05566 5.55545L1.55566 5.55546ZM6.22234 8.22213V8.72213H9.7779V8.22213V7.72213H6.22234V8.22213ZM13.1112 13.5555V13.0555H2.889V13.5555V14.0555H13.1112V13.5555ZM1.5557 2.44436L1.5557 2.94436L14.4446 2.94434L14.4446 2.44434L14.4446 1.94434L1.5557 1.94436L1.5557 2.44436ZM14.4446 5.55545L14.4446 5.05545L1.55566 5.05546L1.55566 5.55546L1.55566 6.05546L14.4446 6.05545L14.4446 5.55545Z\" fill=\"currentColor\"/>",
  },
  "info": {
    viewBox: "0 0 16 16",
    body: "<g transform=\"translate(2 2)\"><path d=\"M12 12H0V0H12V12ZM1 1V11H11V1H1ZM6.5791 4.81641V9.37207H5.5791V5.81641H4.46777V4.81641H6.5791ZM6.85645 2.62891V3.62891H5.30078V2.62891H6.85645Z\" fill=\"currentColor\"/></g>",
  },
  "keyboard": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M5.125 7.375V4.375H14.875V2.875M8.3125 13.9375H11.6875M8.125 13.9375H11.875M2.125 7.375H17.875V17.125H2.125V7.375ZM5.5 10.375H5.125V10.75H5.5V10.375ZM8.5 10.375H8.125V10.75H8.5V10.375ZM11.875 10.375H11.5V10.75H11.875V10.375ZM14.875 10.375H14.5V10.75H14.875V10.375ZM14.875 13.75H14.5V14.125H14.875V13.75ZM5.5 13.75H5.125V14.125H5.5V13.75Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "lock": {
    viewBox: "0 0 16 16",
    body: "<rect x=\"3.5\" y=\"7\" width=\"9\" height=\"7\" rx=\"1\" stroke=\"currentColor\"/><path d=\"M5 7V5a3 3 0 0 1 6 0v2M8 10v1\" stroke=\"currentColor\" stroke-linecap=\"round\"/>",
  },
  "bullet-list": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M9.58329 13.7497H17.0833M9.58329 6.24967H17.0833M6.24996 6.24967C6.24996 7.17015 5.50377 7.91634 4.58329 7.91634C3.66282 7.91634 2.91663 7.17015 2.91663 6.24967C2.91663 5.3292 3.66282 4.58301 4.58329 4.58301C5.50377 4.58301 6.24996 5.3292 6.24996 6.24967ZM6.24996 13.7497C6.24996 14.6701 5.50377 15.4163 4.58329 15.4163C3.66282 15.4163 2.91663 14.6701 2.91663 13.7497C2.91663 12.8292 3.66282 12.083 4.58329 12.083C5.50377 12.083 6.24996 12.8292 6.24996 13.7497Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "menu": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2 8H14M2 4.664H14M2 11.336H14\" stroke=\"currentColor\"/>",
  },
  "comment": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M13.5 2.5H2.5V13.5H4.5L5.5 11.5H13.5V2.5Z\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-linecap=\"square\"/>",
  },
  "collapse": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8 1V6M11 3L8 6L5 3\" stroke=\"currentColor\"/><path d=\"M8 15V10M11 13L8 10L5 13\" stroke=\"currentColor\"/><path d=\"M4 8H6\" stroke=\"currentColor\"/><path d=\"M7 8H9\" stroke=\"currentColor\"/><path d=\"M10 8H12\" stroke=\"currentColor\"/>",
  },
  "monitor": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M4.05559 9.38889H0.500007C0.500007 9.38889 0.500017 8.59298 0.500017 7.61112V2.27778C0.500017 1.29594 0.500102 0.5 0.500102 0.5H13.3889C13.3889 0.5 13.3889 1.29594 13.3889 2.27778V7.61112C13.3889 8.59298 13.3889 9.38889 13.3889 9.38889H9.83336M4.05559 9.38889V11.6111H6.94448H9.83336V9.38889M4.05559 9.38889H9.83336\" transform=\"translate(1.05556 1.94444)\" stroke=\"currentColor\"/>",
  },
  "appearance": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.00012 13.9997L13.9998 2\" stroke=\"currentColor\" stroke-linecap=\"square\"/><path d=\"M2.00012 8.35278L8.3529 2\" stroke=\"currentColor\" stroke-linecap=\"square\"/><path d=\"M2.00012 2.70586L2.70599 2\" stroke=\"currentColor\" stroke-linecap=\"square\"/><path d=\"M7.64722 14.0012L14 7.64844\" stroke=\"currentColor\" stroke-linecap=\"square\"/><path d=\"M13.2935 13.9988L13.9993 13.293\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "sidebar": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M7.86667 2H5.2H2V18H5.2H7.86667M7.86667 2H18V18H7.86667M7.86667 2V18\" stroke=\"currentColor\"/>",
  },
  "edit": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M13.5556 8.21529V13.5556H2.44446L2.44446 2.44445H7.78474M6.00002 8.16216V10H7.83786L14 3.83784L12.1622 2L6.00002 8.16216Z\" stroke=\"currentColor\"/>",
  },
  "extensions": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8 6.75047V9.25047M10.668 6.75047V9.25047M5.33398 6.75047V9.25047M1.33398 2.44531V13.5553H14.6673V2.44531H1.33398Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "plus": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8 2.88867V13.1109\" stroke=\"currentColor\" stroke-linejoin=\"round\"/><path d=\"M2.88867 8H13.1109\" stroke=\"currentColor\" stroke-linejoin=\"round\"/>",
  },
  "outline-rotate-clockwise": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M14.1992 8C14.1992 9.18669 13.8473 10.3467 13.188 11.3334C12.5288 12.3201 11.5917 13.0892 10.4953 13.5433C9.39897 13.9974 8.19257 14.1162 7.02868 13.8847C5.86479 13.6532 4.7957 13.0818 3.95658 12.2426C3.11747 11.4035 2.54602 10.3344 2.31451 9.17054C2.083 8.00666 2.20182 6.80026 2.65594 5.7039C3.11007 4.60754 3.87911 3.67047 4.8658 3.01118C5.85249 2.35189 7.01253 2 8.19922 2C9.87922 2 11.4859 2.66667 12.6926 3.82667L14.1992 5.33333M10.866 5.33333L14.1992 5.33333L14.1993 2\" stroke=\"currentColor\" stroke-linecap=\"square\" stroke-linejoin=\"round\"/>",
  },
  "outline-undo": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2 10L4.25193 7.76999C7.29213 4.7594 12.4119 5.77372 14.0747 9.71606\" stroke=\"currentColor\"/><path d=\"M2 6V10H6\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "magnifying-glass": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M14 14L10.3454 10.3454M6.88889 11.7778C9.58889 11.7778 11.7778 9.58889 11.7778 6.88889C11.7778 4.18889 9.58889 2 6.88889 2C4.18889 2 2 4.18889 2 6.88889C2 9.58889 4.18889 11.7778 6.88889 11.7778Z\" stroke=\"currentColor\"/>",
  },
  "settings-gear": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M7.99998 1.3335L14 4.66683V11.3335L7.99998 14.6668L2 11.3335V4.66683L7.99998 1.3335Z\" stroke=\"currentColor\"/><path d=\"M9.99998 8.00016C9.99998 9.10476 9.10458 10.0002 7.99998 10.0002C6.89538 10.0002 5.99998 9.10476 5.99998 8.00016C5.99998 6.89556 6.89538 6.00016 7.99998 6.00016C9.10458 6.00016 9.99998 6.89556 9.99998 8.00016Z\" stroke=\"currentColor\"/>",
  },
  "share": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M10.0013 12.0846L10.0013 3.33464M13.7513 6.66797L10.0013 2.91797L6.2513 6.66797M17.0846 10.418V17.0846H2.91797V10.418\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "prompt": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M14.5841 12.0807H17.9193V2.91406H5.6276V6.2474M14.5859 6.2474H2.08594V15.4141H5.0026V17.4974L8.7526 15.4141H14.5859V6.2474Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "outline-sliders": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M11.7779 4.66675H14.4446M11.7779 4.66675C11.7779 5.77132 10.8825 6.66675 9.77789 6.66675C8.67332 6.66675 7.77789 5.77132 7.77789 4.66675M11.7779 4.66675C11.7779 3.56218 10.8825 2.66675 9.77789 2.66675C8.67332 2.66675 7.77789 3.56218 7.77789 4.66675M1.55566 4.66675H7.77789M4.22233 11.3334H1.55566M4.22233 11.3334C4.22233 12.438 5.11776 13.3334 6.22233 13.3334C7.3269 13.3334 8.22233 12.438 8.22233 11.3334M4.22233 11.3334C4.22233 10.2288 5.11776 9.33341 6.22233 9.33341C7.3269 9.33341 8.22233 10.2288 8.22233 11.3334M14.4446 11.3334H8.22233\" stroke=\"currentColor\"/>",
  },
  "stop": {
    viewBox: "0 0 20 20",
    body: "<rect x=\"5\" y=\"5\" width=\"10\" height=\"10\" fill=\"currentColor\"/>",
  },
  "terminal": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M6.5 8L8.64286 10L6.5 12M10.9286 12H13.5M2 18H18V2H2V18Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "outline-console": {
    viewBox: "0 0 14 14",
    body: "<path d=\"M2.13889 11.0833L6.22222 7L2.13889 2.91667M7.38888 11.0834H11.8611\" stroke=\"currentColor\"/>",
  },
  "outline-trash": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M5.5 4.5H2.5L4 14.5H12L13.5 4.5H10.5M5.5 4.5V1.5H10.5V4.5M5.5 4.5H10.5M6.5 11.5L6 7M9.5 11.5L10 7\" stroke=\"currentColor\"/>",
  },
  "outline-hexagonal-warning": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M10.6667 1.33325H5.33272L1.33334 5.33325L1.33342 10.6917L5.3327 14.691L10.6667 14.6909L14.6911 10.6917V5.33255L10.6667 1.33325Z\" stroke=\"currentColor\"/><path d=\"M8 10.6667H8.00667\" stroke=\"currentColor\" stroke-linecap=\"square\"/><path d=\"M8 7.99992V5.33325\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  warning: {
    viewBox: "0 0 20 20",
    body: "<path d=\"M10 7.91667V11.6667M10 13.7417V13.75M10 2.5L1.875 16.25H18.125L10 2.5Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "cloud-upload": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M12.0833 16.25H15C17.0711 16.25 18.75 14.5711 18.75 12.5C18.75 10.5649 17.2843 8.97217 15.4025 8.77133C15.2 6.13103 12.8586 4.08333 10 4.08333C7.71532 4.08333 5.76101 5.49781 4.96501 7.49881C2.84892 7.90461 1.25 9.76559 1.25 11.6667C1.25 13.9813 3.30203 16.25 5.83333 16.25H7.91667M10 16.25V10.4167M12.0833 11.875L10 9.79167L7.91667 11.875\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "xmark-small": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M4.25 11.75L11.75 4.25M11.75 11.75L4.25 4.25\" stroke=\"currentColor\"/>",
  },
  "outline-xmark": {
    viewBox: "0 0 16 16",
    body: "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M4.99487 5.70186L7.29297 7.99995L4.99487 10.2981L5.70198 11.0052L8.00008 8.70706L10.2982 11.0052L11.0053 10.2981L8.70718 7.99995L11.0053 5.70186L10.2982 4.99475L8.00008 7.29285L5.70198 4.99475L4.99487 5.70186Z\" fill=\"currentColor\"/>",
  },
  "layout-left": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M2.91675 2.91699L2.91675 2.41699L2.41675 2.41699L2.41675 2.91699L2.91675 2.91699ZM17.0834 2.91699L17.5834 2.91699L17.5834 2.41699L17.0834 2.41699L17.0834 2.91699ZM17.0834 17.0837L17.0834 17.5837L17.5834 17.5837L17.5834 17.0837L17.0834 17.0837ZM2.91675 17.0837L2.41675 17.0837L2.41675 17.5837L2.91675 17.5837L2.91675 17.0837ZM7.41674 17.0837L7.41674 17.5837L8.41674 17.5837L8.41674 17.0837L7.91674 17.0837L7.41674 17.0837ZM8.41674 2.91699L8.41674 2.41699L7.41674 2.41699L7.41674 2.91699L7.91674 2.91699L8.41674 2.91699ZM2.91675 2.91699L2.91675 3.41699L17.0834 3.41699L17.0834 2.91699L17.0834 2.41699L2.91675 2.41699L2.91675 2.91699ZM17.0834 2.91699L16.5834 2.91699L16.5834 17.0837L17.0834 17.0837L17.5834 17.0837L17.5834 2.91699L17.0834 2.91699ZM17.0834 17.0837L17.0834 16.5837L2.91675 16.5837L2.91675 17.0837L2.91675 17.5837L17.0834 17.5837L17.0834 17.0837ZM2.91675 17.0837L3.41675 17.0837L3.41675 2.91699L2.91675 2.91699L2.41675 2.91699L2.41675 17.0837L2.91675 17.0837ZM7.91674 17.0837L8.41674 17.0837L8.41674 2.91699L7.91674 2.91699L7.41674 2.91699L7.41674 17.0837L7.91674 17.0837Z\" fill=\"currentColor\"/>",
  },
  "layout-left-full": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M2.91732 2.91602L7.91732 2.91602L7.91732 17.0827H2.91732L2.91732 2.91602Z\" fill=\"currentColor\"/><path d=\"M2.91732 2.91602L17.084 2.91602M2.91732 2.91602L2.91732 17.0827M2.91732 2.91602L7.91732 2.91602M17.084 2.91602L17.084 17.0827M17.084 2.91602L7.91732 2.91602M17.084 17.0827L2.91732 17.0827M17.084 17.0827L7.91732 17.0827M2.91732 17.0827H7.91732M7.91732 17.0827L7.91732 2.91602\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "outline-worktree": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M12 3.11133L14.3885 5.49977L12 7.88822M14.5 5.49972H10.058L5.13456 11.8139M14.5 11.6606L8.5 11.6606M5.50012 11.6597H1.5\" stroke=\"currentColor\"/>",
  },
  "providers": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M5.11115 3.33252H10.8889M5.11115 3.33252L3.33337 3.33254V12.6658H5.11115M5.11115 3.33252L5.11108 1.55469M10.8889 3.33252L12.6667 3.33252V12.6658H10.8889M10.8889 3.33252L10.8889 1.55469M10.8889 12.6658H5.11115M10.8889 12.6658L10.8889 14.4435M5.11115 12.6658L5.11108 14.4435M8 1.55469V3.33247M14.4444 7.99915H12.6666M14.4444 5.11023H12.6666M14.4444 10.8881H12.6666M8 14.4435V12.6658M1.55554 7.99915H3.33332M1.55554 10.8881H3.33332M1.55554 5.11023H3.33332M6 9.99915V5.99915H10V9.99915H6Z\" stroke=\"currentColor\"/>",
  },
  "post-skill": {
    viewBox: "0 0 20 20",
    body: "<rect x=\"2.5\" y=\"3.5\" width=\"15\" height=\"13\" rx=\"1.5\" stroke=\"currentColor\"/><path d=\"M5.5 7.5H10.5M5.5 10.5H14.5\" stroke=\"currentColor\"/>",
  },
  "mcp": {
    viewBox: "0 0 20 20",
    body: "<g><path d=\"M0.972656 9.37176L9.5214 1.60019C10.7018 0.527151 12.6155 0.527151 13.7957 1.60019C14.9761 2.67321 14.9761 4.41295 13.7957 5.48599L7.3397 11.3552\" stroke=\"currentColor\" stroke-linecap=\"round\"/><path d=\"M7.42871 11.2747L13.7957 5.48643C14.9761 4.41338 16.8898 4.41338 18.0702 5.48643L18.1147 5.52688C19.2951 6.59993 19.2951 8.33966 18.1147 9.4127L10.3831 16.4414C9.98966 16.7991 9.98966 17.379 10.3831 17.7366L11.9707 19.1799\" stroke=\"currentColor\" stroke-linecap=\"round\"/><path d=\"M11.6587 3.54346L5.33619 9.29119C4.15584 10.3642 4.15584 12.1039 5.33619 13.177C6.51649 14.25 8.43019 14.25 9.61054 13.177L15.9331 7.42923\" stroke=\"currentColor\" stroke-linecap=\"round\"/></g>",
  },
  /* Lingzhu-only surfaces have no reference counterpart. These keep the
     reference grid, 1px strokes and currentColor instead of a fallback set. */
  "app-activity": {
    viewBox: "0 0 20 20",
    body: "<path d=\"M2.5 10H6L8.25 4.5L11.75 15.5L14 10H17.5\" stroke=\"currentColor\" stroke-width=\"1.25\" stroke-linecap=\"square\"/>",
  },
  "app-circle": {
    viewBox: "0 0 16 16",
    body: "<circle cx=\"8\" cy=\"8\" r=\"6.5\" stroke=\"currentColor\"/>",
  },
  "app-clock": {
    viewBox: "0 0 16 16",
    body: "<circle cx=\"8\" cy=\"8\" r=\"6.5\" stroke=\"currentColor\"/><path d=\"M8 4.25V8L10.5 9.5\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "app-command": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6ZM10 6V4.5A1.5 1.5 0 1 1 11.5 6H10ZM6 10V11.5A1.5 1.5 0 1 1 4.5 10H6ZM10 10V11.5A1.5 1.5 0 1 0 11.5 10H10ZM6 6H10V10H6V6Z\" stroke=\"currentColor\"/>",
  },
  "app-pause": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M6 3.5V12.5M10 3.5V12.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"square\"/>",
  },
  "app-play": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M5 3.5L12.5 8L5 12.5V3.5Z\" stroke=\"currentColor\" stroke-linejoin=\"round\"/>",
  },
  "app-power": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8 2V8\" stroke=\"currentColor\" stroke-linecap=\"square\"/><path d=\"M4.5 4.5A5 5 0 1 0 11.5 4.5\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  },
  "app-qr": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.5 2.5H6.5V6.5H2.5V2.5ZM9.5 2.5H13.5V6.5H9.5V2.5ZM2.5 9.5H6.5V13.5H2.5V9.5Z\" stroke=\"currentColor\"/><path d=\"M9.5 9.5H11V11H9.5V9.5ZM12 9.5H13.5V11M9.5 12V13.5H11M12 12H13.5V13.5\" stroke=\"currentColor\"/>",
  },
  "app-save": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.5 2.5H11L13.5 5V13.5H2.5V2.5Z\" stroke=\"currentColor\"/><path d=\"M5 2.5V6H10.5V2.5M5 13.5V9H11V13.5\" stroke=\"currentColor\"/>",
  },
  "app-scroll": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M4 3.5H12.5V11.5C12.5 12.6 13.4 13.5 14.5 13.5H6C4.9 13.5 4 12.6 4 11.5V3.5Z\" stroke=\"currentColor\"/><path d=\"M6.5 6H10M6.5 8.5H10\" stroke=\"currentColor\"/>",
  },
  "app-sparkles": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8 1.75L9.25 6.75L14.25 8L9.25 9.25L8 14.25L6.75 9.25L1.75 8L6.75 6.75L8 1.75Z\" stroke=\"currentColor\" stroke-linejoin=\"round\"/>",
  },
  "app-star": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M8 1.75L9.85 6.1L14.5 6.5L11 9.5L12.05 14.1L8 11.65L3.95 14.1L5 9.5L1.5 6.5L6.15 6.1L8 1.75Z\" stroke=\"currentColor\" stroke-linejoin=\"round\"/>",
  },
  "app-wand": {
    viewBox: "0 0 16 16",
    body: "<path d=\"M2.5 13.5L10.5 5.5M9 2.5L9.5 3.5M13.5 6.5L14.5 7M12 2L12.5 3L13.5 3.5L12.5 4L12 5L11.5 4L10.5 3.5L11.5 3L12 2Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  },
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name?: string;
}

/** Renders reference artwork centered in a 16px viewport by default. */
export function Icon({ art: artName, ...props }: IconProps & { art: string }) {
  const { className, name: _name, ...rest } = props;
  const value = art[artName] ?? art.plus;
  return (
    <svg
      viewBox={value.viewBox}
      width={16}
      height={16}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
      className={className}
      dangerouslySetInnerHTML={{ __html: value.body }}
    />
  );
}

export const ArrowDown = (props: IconProps) => <Icon art="arrow-down-to-line" {...props} />;
export const ArrowLeft = (props: IconProps) => <Icon art="outline-arrow-left" {...props} />;
export const ArrowRight = (props: IconProps) => <Icon art="outline-arrow-right" {...props} />;
export const ArrowUp = (props: IconProps) => <Icon art="arrow-up" {...props} />;
export const Ban = (props: IconProps) => <Icon art="circle-ban-sign" {...props} />;
export const Bell = (props: IconProps) => <Icon art="notifications" {...props} />;
export const Bot = (props: IconProps) => <Icon art="brain" {...props} />;
export const Boxes = (props: IconProps) => <Icon art="cube" {...props} />;
export const Check = (props: IconProps) => <Icon art="check" {...props} />;
export const ChevronDown = (props: IconProps) => <Icon art="chevron-down" {...props} />;
export const ChevronRight = (props: IconProps) => <Icon art="outline-chevron-right" {...props} />;
export const ChevronsUpDown = (props: IconProps) => <Icon art="chevron-grabber-vertical" {...props} />;
export const CircleAlert = (props: IconProps) => <Icon art="circle-exclamation" {...props} />;
export const Clipboard = (props: IconProps) => <Icon art="copy" {...props} />;
export const ClipboardList = (props: IconProps) => <Icon art="checklist" {...props} />;
export const Code = (props: IconProps) => <Icon art="code-slash" {...props} />;
export const SquareArrow = (props: IconProps) => <Icon art="outline-square-arrow" {...props} />;
export const Copy = (props: IconProps) => <Icon art="outline-copy" {...props} />;
export const Cpu = (props: IconProps) => <Icon art="models" {...props} />;
export const Database = (props: IconProps) => <Icon art="server" {...props} />;
export const Download = (props: IconProps) => <Icon art="download" {...props} />;
export const Ellipsis = (props: IconProps) => <Icon art="outline-dots" {...props} />;
export const ExternalLink = (props: IconProps) => <Icon art="outline-arrow-up-right" {...props} />;
export const Eye = (props: IconProps) => <Icon art="outline-eye" {...props} />;
export const EyeOff = (props: IconProps) => <Icon art="outline-eye-slash" {...props} />;
export const FileCode2 = (props: IconProps) => <Icon art="file-document" {...props} />;
export const FilePlus = (props: IconProps) => <Icon art="file-document" {...props} />;
export const FileSearch = (props: IconProps) => <Icon art="file-document" {...props} />;
export const FileText = (props: IconProps) => <Icon art="file-document" {...props} />;
export const FolderClosed = (props: IconProps) => <Icon art="folder" {...props} />;
export const FolderCog = (props: IconProps) => <Icon art="folder" {...props} />;
export const FolderInput = (props: IconProps) => <Icon art="folder-add-left" {...props} />;
export const FolderOpen = (props: IconProps) => <Icon art="folder" {...props} />;
export const FolderPlus = (props: IconProps) => <Icon art="folder-add-left" {...props} />;
export const FolderTree = (props: IconProps) => <Icon art="filetree" {...props} />;
export const Gauge = (props: IconProps) => <Icon art="window-analytics" {...props} />;
export const GitBranch = (props: IconProps) => <Icon art="branch" {...props} />;
export const GitCompare = (props: IconProps) => <Icon art="review" {...props} />;
export const GitFork = (props: IconProps) => <Icon art="fork" {...props} />;
export const Globe = (props: IconProps) => <Icon art="outline-globe" {...props} />;
export const Grid2x2Plus = (props: IconProps) => <Icon art="grid-plus" {...props} />;
export const History = (props: IconProps) => <Icon art="arrow-undo-down" {...props} />;
export const Image = (props: IconProps) => <Icon art="outline-photo" {...props} />;
export const ImagePlus = (props: IconProps) => <Icon art="outline-photo" {...props} />;
export const Images = (props: IconProps) => <Icon art="outline-photo" {...props} />;
export const Inbox = (props: IconProps) => <Icon art="archive" {...props} />;
export const Info = (props: IconProps) => <Icon art="info" {...props} />;
export const Keyboard = (props: IconProps) => <Icon art="keyboard" {...props} />;
export const KeyRound = (props: IconProps) => <Icon art="lock" {...props} />;
export const Layers = (props: IconProps) => <Icon art="cube" {...props} />;
export const Link2 = (props: IconProps) => <Icon art="outline-arrow-up-right" {...props} />;
export const ListChecks = (props: IconProps) => <Icon art="checklist" {...props} />;
export const ListTodo = (props: IconProps) => <Icon art="bullet-list" {...props} />;
export const Menu = (props: IconProps) => <Icon art="menu" {...props} />;
export const MessageSquare = (props: IconProps) => <Icon art="comment" {...props} />;
export const MessageSquarePlus = (props: IconProps) => <Icon art="comment" {...props} />;
export const Minimize2 = (props: IconProps) => <Icon art="collapse" {...props} />;
export const Monitor = (props: IconProps) => <Icon art="monitor" {...props} />;
export const MoreHorizontal = (props: IconProps) => <Icon art="outline-dots" {...props} />;
export const Package = (props: IconProps) => <Icon art="cube" {...props} />;
export const Palette = (props: IconProps) => <Icon art="appearance" {...props} />;
export const Pencil = (props: IconProps) => <Icon art="edit" {...props} />;
export const Plug = (props: IconProps) => <Icon art="extensions" {...props} />;
export const Plus = (props: IconProps) => <Icon art="plus" {...props} />;
export const Puzzle = (props: IconProps) => <Icon art="extensions" {...props} />;
export const RefreshCw = (props: IconProps) => <Icon art="outline-rotate-clockwise" {...props} />;
export const RotateCcw = (props: IconProps) => <Icon art="outline-undo" {...props} />;
export const RotateCw = (props: IconProps) => <Icon art="outline-rotate-clockwise" {...props} />;
export const Search = (props: IconProps) => <Icon art="magnifying-glass" {...props} />;
export const Send = (props: IconProps) => <Icon art="arrow-up" {...props} />;
export const Server = (props: IconProps) => <Icon art="server" {...props} />;
export const Settings2 = (props: IconProps) => <Icon art="settings-gear" {...props} />;
export const Share2 = (props: IconProps) => <Icon art="share" {...props} />;
export const SlashSquare = (props: IconProps) => <Icon art="prompt" {...props} />;
export const SlidersHorizontal = (props: IconProps) => <Icon art="outline-sliders" {...props} />;
export const Square = (props: IconProps) => <Icon art="stop" {...props} />;
export const SquareTerminal = (props: IconProps) => <Icon art="terminal" {...props} />;
export const Terminal = (props: IconProps) => <Icon art="outline-console" {...props} />;
export const Trash2 = (props: IconProps) => <Icon art="outline-trash" {...props} />;
export const TriangleAlert = (props: IconProps) => <Icon art="outline-hexagonal-warning" {...props} />;
export const Warning = (props: IconProps) => <Icon art="warning" {...props} />;
export const Undo2 = (props: IconProps) => <Icon art="outline-undo" {...props} />;
export const Unplug = (props: IconProps) => <Icon art="extensions" {...props} />;
export const Upload = (props: IconProps) => <Icon art="cloud-upload" {...props} />;
export const X = (props: IconProps) => <Icon art="xmark-small" {...props} />;
export const XMarkFilled = (props: IconProps) => <Icon art="outline-xmark" {...props} />;
export const LayoutLeft = (props: IconProps) => <Icon art="layout-left" {...props} />;
export const LayoutLeftFull = (props: IconProps) => <Icon art="layout-left-full" {...props} />;
export const Worktree = (props: IconProps) => <Icon art="outline-worktree" {...props} />;
export const Providers = (props: IconProps) => <Icon art="providers" {...props} />;
export const Flask = (props: IconProps) => <Icon art="flask" {...props} />;

export const Activity = (props: IconProps) => <Icon art="app-activity" {...props} />;
export const Circle = (props: IconProps) => <Icon art="app-circle" {...props} />;
export const Clock = (props: IconProps) => <Icon art="app-clock" {...props} />;
export const Command = (props: IconProps) => <Icon art="app-command" {...props} />;
export const Pause = (props: IconProps) => <Icon art="app-pause" {...props} />;
export const Play = (props: IconProps) => <Icon art="app-play" {...props} />;
export const Power = (props: IconProps) => <Icon art="app-power" {...props} />;
export const QrCode = (props: IconProps) => <Icon art="app-qr" {...props} />;
export const Save = (props: IconProps) => <Icon art="app-save" {...props} />;
export const ScrollText = (props: IconProps) => <Icon art="app-scroll" {...props} />;
export const Sparkles = (props: IconProps) => <Icon art="app-sparkles" {...props} />;
export const Star = (props: IconProps) => <Icon art="app-star" {...props} />;
export const Wand2 = (props: IconProps) => <Icon art="app-wand" {...props} />;
