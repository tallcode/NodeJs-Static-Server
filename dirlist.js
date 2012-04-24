var 
substitute = function(str, data){
	return str.replace(/\{(\w+)\}/g, function(r, m){
		return data[m] !== undefined ? data[m] : '{' + m + '}';
	});
},
template = '<html>'+
							'<head>'+
								'<meta charset="utf-8"/>'+
								'<title>{title}</title>'+
							'</head>'+
							'<body>'+
								'{body}'+
							'</body>'+
						'</html>';
					

//返回文件列表html
exports.list = function(obj,files){
	var
	html,
	arr = [];
	
	for(var i =0;i<files.length;i++){
		arr.push('<li><a href="'+files[i]+'">'+files[i]+'</a></li>');
	}
	
	html = substitute(template,{title:'List',body:'<ul>'+arr.join('')+'</ul>'})
	return html;
};